<div align="center">

# 여기지!  
### 여성 1인 여행자를 위한 DB 기반 가이드맵 및 안전 동행 매칭 서비스

데이터 기반 안전 정보, 지도 시각화, 경로 추천, 동행 매칭을 통해  
여성 1인 여행자의 이동 불안과 정보 공백을 줄이는 안전 여행 지원 웹 서비스

<br />

**Team 404** · 이아림 · 노유나 · 이채원  
산학 프로젝트

</div>

---

## Overview

여기지!는 사용자 리뷰와 공공데이터를 기반으로 위치별 안전도를 산출하고,  
이를 지도 위에 시각화하여 더 안전한 이동 경로를 추천하는 서비스입니다.

기존 지도 서비스가 거리와 시간 중심의 경로 탐색에 집중한다면,  
여기지!는 사용자의 실제 이동 환경에서 중요한 기준이 될 수 있는 '안전성'에 주목합니다.

AI 분석을 통해 리뷰 데이터를 정량화하고, 이를 지역 안전 정보와 결합하여  
사용자가 보다 안전한 경로를 선택할 수 있도록 지원하는 것을 목표로 합니다.

---

## Problem

기존 지도 서비스는 주로 최단 거리와 소요 시간을 기준으로 경로를 제공합니다.  
하지만 낯선 지역이나 늦은 시간대의 이동에서는 경로의 안전성이 더 중요한 판단 기준이 될 수 있습니다.

특히 여성 1인 여행자의 경우, 신뢰할 수 있는 안전 정보가 부족하면  
이동 자체에 대한 심리적 부담이 커지고 선택 가능한 동선도 제한될 수 있습니다.

저희는 이러한 정보 공백이 실제 이동의 제약으로 이어진다고 보았고,  
안전도를 반영한 지도 시각화와 경로 추천이 필요하다고 판단했습니다.

---

## Solution

본 프로젝트는 아래 3가지 핵심 기능으로 문제를 해결합니다.

### 1. Safety Map Visualization
- 공공 데이터 및 사용자 리뷰 기반 안전 점수 DB 구축
- Google Maps 기반 안전도 시각화

### 2. AI-Powered Safe Route Recommendation
- OpenAI API를 활용한 안전 경로 생성
- 안전도 + 위치 반영

### 3. Women-Only Companion Matching
- 같은 지역/시간 여행자 매칭
- 안전 인증 기반 사용자 필터링

---

## MVP

본 프로젝트의 핵심 MVP는 **데이터 기반 안전 지도 (Safety Map)** 입니다.

### 핵심 기능 : 안전 지도 시각화 및 안전 경로 추천 시스템

- 사용자 리뷰 데이터 입력 (위험/안전 경험)  
- 공공 데이터(지역 범죄율, 거리 활성도 등) 연동 및 통합 
- 장소별 안전 점수 산출  
- 안전도 시각화 및 경로 추천

### 결과
- 사용자는 특정 지역의 안전도를 직관적으로 확인 가능  
- “어디가 안전한가?”를 지도에서 판단 가능  
- 출발지~목적지 간 더 안전한 이동 경로 선택 가능

### 핵심 가치
- 여성 1인 이동 시 발생하는 불안감 최소화  
- 안전 정보를 기반으로 한 자율적 이동권 강화  
- 단순 길찾기가 아닌 안전 중심 경로 선택 가능

---

## Core Logic

### Safety Map Generation

본 시스템의 핵심 로직은 사용자 리뷰 데이터 + 공공 데이터 분석을 통한 안전도 점수 산출 및 지도 시각화입니다.

**1. 데이터 수집**  
사용자 리뷰 데이터 (위험/안전 경험, 텍스트 입력)  
공공 데이터 (치안 정보, 사고 발생률, 환경 데이터 등)

**2. 데이터 전처리**  
리뷰 텍스트 정제 (불용어 제거, 키워드 추출)  
지역 단위로 데이터 정렬 및 통합

**3. 안전도 점수 계산**  
사용자 리뷰 기반 점수  
공공 데이터 기반 위험도 점수

**4. 안전 지도 생성**  
Google Maps 기반 지도 렌더링  
지역별 safety_score를 평점으로 변환

---

## Architecture

```text
User
↓
Frontend (React + Google Maps)
↓
Backend (FastAPI)
↓
Database (MySQL)
↓
AI Engine (OpenAI API)
↓
Response
↓
User
```

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React, JavaScript / HTML / CSS, Google Cloud Console |
| Backend | FastAPI |
| Database | MySQL |
| AI | OpenAI API |

---

## Repository Structure

본 프로젝트는 Spring404 레포지토리 기반 멀티 브랜치 구조로 관리되며,  
프론트엔드 / 백엔드 / AI 모듈이 각각 독립 브랜치에서 개발 및 관리됩니다.

```text
📦 Spring404 (main repository)
┣ 🌿 frontend
┃ ┣ App.jsx
┣ 🌿 backend
┃ ┣ .gitignore
┃ ┣ db.py
┃ ┣ main.py
┃ ┣ schemas.py
┃ ┗ requirements.txt
┣ 🌿 ai
┃ ┣ .gitignore
┃ ┣ README.md
┃ ┣ main.py
┃ ┗ requirements.txt
┗ 🌿 main
  ┗ 통합 관리 및 배포 브랜치
```

### Branch Roles

#### frontend
`App.jsx`
- React 기반 사용자 UI
- 지도 (Google Maps) 렌더링
- 안전 지도 시각화 화면

#### backend
`.gitignore`
- 깃허브에 업로드하지 않을 파일 목록 관리
- venv, 캐시 파일, 환경변수 등 제외 설정

`db.py`
- MySQL 데이터베이스 연결 및 관리
- 리뷰 데이터 저장 및 조회 기능 구현

`main.py`
- FastAPI 기반 백엔드 서버 실행 파일
- API 엔드포인트 정의 및 요청 처리
- AI 서버와 통신하여 위험도 계산

`schemas.py`
- 요청/응답 데이터 구조 정의 (Pydantic)
- 데이터 검증 및 타입 관리

`requirements.txt`
- 프로젝트 실행에 필요한 라이브러리 목록
- 동일한 개발 환경 재현을 위한 설정 파일

#### ai
`.gitignore`
- 깃허브에 업로드하지 않을 파일 목록 관리

`main.py`
- FastAPI 기반 AI 분석 서버 실행 파일
- 리뷰 텍스트를 수신하여 위험도(danger_score) 분석 및 반환
- 특정 키워드 감지 시 안전 점수 차감 로직 수행

`requirements.txt`
- AI 서버 실행에 필요한 라이브러리 목록
- 서버 환경 구축을 위한 의존성 관리 파일

### Why this structure
- 팀원별 독립 개발 환경 보장
- 기능 단위 분리로 협업 효율 증가
- 이후 main 브랜치에서 통합 관리

---

## Expected Impact

- 여성 1인 여행자의 심리적 안정성 증가
- 데이터 기반 위험 회피 가능
- 안전 중심 여행 환경 구축

---

## Closing

여기지!는 단순 여행 경로 서비스가 아니라  
**안전이라는 기준을 중심으로 여행을 돕는 서비스**입니다.
