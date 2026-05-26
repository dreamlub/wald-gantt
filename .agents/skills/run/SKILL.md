---
description: wald-gantt 개발 서버 실행
---

## 환경 요구사항

- `.env.local` 필수 (Supabase URL/KEY, Slack 토큰 등 포함)
- Node.js 설치 필요

## 실행

```bash
npm run dev
```

- Next.js 16.2.6 + Turbopack 사용
- 기본 포트: **3000** (사용 중이면 자동으로 3001로 올라감)
- 준비 완료 로그: `✓ Ready in ...ms`

## 연기 방식

백그라운드로 실행 후 HTTP 응답 확인:

```bash
# 백그라운드 실행
npm run dev &

# 서버 준비 대기 후 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
# 또는 포트 3001
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
```

## 주요 라우트

| 경로 | 설명 |
|------|------|
| `/` | 로그인 (미인증 시 리다이렉트) |
| `/projects` | 프로젝트 관리 |
| `/tasks` | 태스크 (칸반/리스트) |
| `/calendar` | 캘린더 + 타임블로킹 |
| `/weekly` | 주간보고 |
| `/summary` | Slack 요약 |
| `/notes` | 데일리 노트 |
| `/settings` | 설정 |

## 참고

- 인증 미완료 상태에서 앱 라우트 접근 시 `/login`으로 307 리다이렉트됨 (정상 동작)
- 로컬 Vault(파일시스템) 연동은 `/notes`에서 브라우저 파일 접근 권한 허용 필요
