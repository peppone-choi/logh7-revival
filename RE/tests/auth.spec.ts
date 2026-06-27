import { expect, test } from '@playwright/test';

test('shows the roadmap dashboard without a sign-in gate', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'LOGH VII 부활 개발 대시보드' })).toBeVisible();
  await expect(page.getByLabel('종합 진행률')).toContainText('65%');
  await expect(page.getByRole('heading', { name: '큰 로드맵' })).toBeVisible();
  await expect(page.getByText('그리드 클릭은 현재 동작하는 것으로 사용자 확인됨')).toBeVisible();
  await expect(page.getByText('post-load action-list 좌석은 LOGH_POSTLOAD_ACTION_LIST_SEATS=1로 기본 제공한다.')).toBeVisible();
});

test('keeps the admin session tool usable when the server is offline', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '게임 세션 상태' })).toBeVisible();
  await expect(page.getByLabel('어드민 API')).toHaveValue('http://127.0.0.1:47910/admin/session-state');
  await expect(page.getByLabel('어드민 토큰')).toBeVisible();
  await page.getByRole('button', { name: '새로고침' }).click();
  await expect(page.getByText(/어드민 오프라인|어드민 확인 중|어드민 연결됨/)).toBeVisible();
});

test('documents the server notice and playable exe commands', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '서버 공지와 EXE 확인' })).toBeVisible();
  await expect(page.getByText('npm run server:auth -- --announcement "서버 점검 안내"')).toBeVisible();
  await expect(page.getByText('python -m tools.logh7_build_playable_client --deploy')).toBeVisible();
  await expect(page.getByText('LOGH_LOBBY_ANNOUNCE_TEXT')).toBeVisible();
});
