"""Exercise production moderation SQL against an in-memory relational database.

MySQL row locking/concurrent transactions must additionally be checked on MySQL.
"""
import ast
import sqlite3
from contextlib import contextmanager
from pathlib import Path
import unittest


SOURCE = Path(__file__).resolve().parents[1] / 'backend' / 'db.py'
NAMES = {'report_review', 'restore_review_by_admin', 'set_admin_checked',
         'get_review_score_average', 'get_reviews', 'attach_review_photos',
         'get_admin_reported_reviews'}
tree = ast.parse(SOURCE.read_text(encoding='utf-8'))
functions = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in NAMES], type_ignores=[])


class Cursor:
    def __init__(self, connection): self.raw = connection.cursor()
    def __enter__(self): return self
    def __exit__(self, *args): self.raw.close()
    def execute(self, sql, params=()):
        self.raw.execute(sql.replace('%s', '?').replace(' FOR UPDATE', '').replace('UTC_TIMESTAMP()', 'CURRENT_TIMESTAMP'), params)
    def fetchone(self):
        row = self.raw.fetchone()
        return dict(row) if row is not None else None
    def fetchall(self): return [dict(row) for row in self.raw.fetchall()]


class ModerationTests(unittest.TestCase):
    def setUp(self):
        self.sql = sqlite3.connect(':memory:')
        self.sql.row_factory = sqlite3.Row
        self.sql.executescript('''
          CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
          CREATE TABLE review(id INTEGER PRIMARY KEY,content TEXT,zone_id INTEGER,lat REAL,lng REAL,
            user_score REAL,ai_score REAL,user_id INTEGER,ai_summary TEXT,ai_tags TEXT,ai_confidence REAL,
            reliability_status TEXT DEFAULT 'normal',reliability_reasons TEXT,reliability_weight REAL DEFAULT 1,
            analysis_source TEXT,analyzed_at TEXT,like_count INTEGER DEFAULT 0,report_count INTEGER DEFAULT 0,
            report_status TEXT DEFAULT 'normal',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,
            deleted_at TEXT,moderation_status TEXT DEFAULT 'normal',admin_checked INTEGER DEFAULT 0,
            moderated_by INTEGER,moderated_at TEXT,moderation_reason TEXT);
          CREATE TABLE review_report(review_id INTEGER,user_id INTEGER,reason TEXT,detail TEXT,
            status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,reviewed_by INTEGER,
            reviewed_at TEXT,PRIMARY KEY(review_id,user_id));
          CREATE TABLE review_photo(review_id INTEGER,photo_data TEXT,photo_name TEXT,sort_order INTEGER);
          INSERT INTO review(id,content,zone_id,user_score,ai_score) VALUES(1,'review',1,2,2),(2,'safe',1,4,4);
        ''')
        self.sql.commit()
        database = self.sql
        class Connection:
            def cursor(self): return Cursor(database)
        @contextmanager
        def connection():
            try:
                yield Connection()
                database.commit()
            except Exception:
                database.rollback()
                raise
        self.api = {'get_connection': connection, '_attach_analysis': lambda rows: rows}
        exec(compile(functions, str(SOURCE), 'exec'), self.api)

    def tearDown(self): self.sql.close()
    def report(self, user): return self.api['report_review'](1,user,'reason','detail')
    def row(self): return dict(self.sql.execute('SELECT * FROM review WHERE id=1').fetchone())

    def test_threshold_excludes_review_and_score(self):
        self.report(1); self.report(2)
        self.assertEqual(self.row()['moderation_status'], 'normal')
        self.assertEqual(self.api['get_review_score_average'](1),3)
        self.report(3)
        self.assertEqual(self.row()['moderation_status'],'auto_hidden')
        self.assertEqual(self.api['get_review_score_average'](1),4)
        self.assertEqual([r['id'] for r in self.api['get_reviews']()], [2])
        hidden = self.api['get_admin_reported_reviews']()
        self.assertEqual(len(hidden),1)
        self.assertEqual(len(hidden[0]['reports']),3)

    def test_duplicate_is_rejected_and_report_flag_survives_reload(self):
        self.report(1)
        with self.assertRaises(ValueError): self.report(1)
        self.assertEqual(self.row()['report_count'],1)
        rows=self.api['get_reviews'](user_id=1)
        self.assertTrue(next(r for r in rows if r['id']==1)['has_reported'])

    def test_restore_closes_old_reports_and_new_users_can_report(self):
        for user in [1,2,3]: self.report(user)
        self.api['restore_review_by_admin'](1,99)
        self.assertEqual(self.api['get_review_score_average'](1),3)
        self.assertEqual(self.api['get_admin_reported_reviews'](),[])
        with self.assertRaises(ValueError): self.report(1)
        for user in [4,5]: self.report(user)
        self.assertEqual(self.row()['moderation_status'],'normal')
        self.report(6)
        self.assertEqual(self.row()['moderation_status'],'auto_hidden')

    def test_checked_flag_does_not_restore_or_change_score(self):
        for user in [1,2,3]: self.report(user)
        self.api['set_admin_checked'](1,True)
        self.assertEqual(self.row()['admin_checked'],1)
        self.assertEqual(self.api['get_review_score_average'](1),4)
        self.api['set_admin_checked'](1,False)
        self.assertEqual(self.row()['admin_checked'],0)

    def test_restore_rejects_author_deleted_and_visible_reviews(self):
        with self.assertRaises(LookupError): self.api['restore_review_by_admin'](1,99)
        for user in [1,2,3]: self.report(user)
        self.sql.execute("UPDATE review SET deleted_at=CURRENT_TIMESTAMP WHERE id=1")
        self.sql.commit()
        with self.assertRaises(LookupError): self.api['restore_review_by_admin'](1,99)
        self.assertIsNotNone(self.row()['deleted_at'])


if __name__ == '__main__': unittest.main()
