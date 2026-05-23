---
description: Playwright로 wald-gantt 앱 UI를 실제로 열어 스크린샷·검증
---

## 사전 요구사항

### 1. Playwright 설치 (프로젝트에 없어서 /tmp에 임시 설치)
```bash
cd /tmp && npm init -y && npm install playwright
npx playwright install chromium
```

### 2. 로그인 자격증명
`.env.local`에 아래 두 줄 추가:
```
DEV_EMAIL=tony@waldlust.co.kr
DEV_PASSWORD=<비밀번호>
```

## 기본 스크린샷 패턴

```js
// /tmp/shot.js
const { chromium } = require('playwright');
const fs = require('fs');

// .env.local에서 자격증명 읽기
const env = fs.readFileSync('/path/to/project/.env.local', 'utf-8');
const email = env.match(/DEV_EMAIL=(.+)/)?.[1]?.trim();
const password = env.match(/DEV_PASSWORD=(.+)/)?.[1]?.trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // 로그인
  await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.includes('/login'), { timeout: 10000 });

  // 원하는 페이지로 이동
  await page.goto('http://localhost:3001/summary', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/screenshot.png', fullPage: false });

  console.log('URL:', page.url());
  await browser.close();
})();
```

실행:
```bash
cd /tmp && node shot.js
```

## 주요 라우트

| 경로 | 설명 |
|------|------|
| `/summary` | Slack 수집 요약 (타임라인/인사이트/요약 탭) |
| `/tasks` | 태스크 칸반·리스트 뷰 |
| `/calendar` | 캘린더 + 타임블로킹 |
| `/weekly` | 주간보고 |
| `/projects` | 프로젝트·간트 |
| `/notes` | 데일리 노트 |
| `/settings` | 설정 |

## 참고

- 개발 서버가 먼저 떠 있어야 함 (`npm run dev` → 포트 3000 또는 3001)
- 포트 확인: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` (200/307이면 정상)
- 로그인 실패 시 Supabase 400 → 이메일/비밀번호 재확인
- `fullPage: true`로 바꾸면 스크롤 전체 캡처 가능
