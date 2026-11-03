export const locationBoxStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: '12px 12px',
  background: '#f8fafc',
};

export const locationLineStyle = {
  display: 'grid',
  gridTemplateColumns: '12px 38px 1fr',
  alignItems: 'center',
  gap: 8,
  minHeight: 30,
};

export const startDotStyle = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#2563eb',
  boxShadow: 'none',
};

export const endDotStyle = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: '#ef4444',
  boxShadow: 'none',
};

export const locationLabelStyle = {
  fontSize: 12,
  color: '#64748b',
  fontWeight: 700,
};

export const locationTextStyle = {
  fontSize: 14,
  color: '#111827',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
};

export const locationDividerStyle = {
  marginLeft: 5,
  height: 14,
  borderLeft: '2px dotted #cbd5e1',
};

export const placeActionRowStyle = {
  display: 'grid',
  gridTemplateColumns: '58px 58px',
  gap: 6,
  marginBottom: 10,
  justifyContent: 'start',
};

export const placeActionStyle = (backgroundColor, color) => ({
  height: 32,
  border: 'none',
  borderRadius: 9,
  backgroundColor,
  color,
  fontWeight: 700,
  fontSize: 13,
});

export const noticeStyle = {
  margin: '8px 0 12px',
  color: '#14532d',
  fontWeight: 600,
  fontSize: 14,
  textAlign: 'center',
};

export const scoreBoxStyle = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 12,
};

export const scoreLabelStyle = {
  color: '#6b7280',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 5,
};

export const scoreValueStyle = {
  color: '#111827',
  fontSize: 18,
  fontWeight: 700,
};

export const targetLineTopStyle = {
  position: 'absolute',
  left: '50%',
  top: -5,
  width: 2,
  height: 6,
  backgroundColor: '#4b5563',
  transform: 'translateX(-50%)',
  borderRadius: 999,
};

export const targetLineBottomStyle = {
  position: 'absolute',
  left: '50%',
  bottom: -5,
  width: 2,
  height: 6,
  backgroundColor: '#4b5563',
  transform: 'translateX(-50%)',
  borderRadius: 999,
};

export const targetLineLeftStyle = {
  position: 'absolute',
  left: -5,
  top: '50%',
  width: 6,
  height: 2,
  backgroundColor: '#4b5563',
  transform: 'translateY(-50%)',
  borderRadius: 999,
};

export const targetLineRightStyle = {
  position: 'absolute',
  right: -5,
  top: '50%',
  width: 6,
  height: 2,
  backgroundColor: '#4b5563',
  transform: 'translateY(-50%)',
  borderRadius: 999,
};

export const targetDotStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 4,
  height: 4,
  borderRadius: 999,
  backgroundColor: '#4b5563',
  transform: 'translate(-50%, -50%)',
};

