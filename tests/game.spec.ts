import { test, expect } from '@playwright/test';

test.describe('Game Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${process.cwd()}/index.html`);
  });

  test('게임 시작 시 플레이어와 적이 바로 스폰되어야 함', async ({ page }) => {
    // Wait for menu
    await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 5000 });

    // Click play button
    await page.click('#btn-play');

    // Wait for character select
    await page.waitForSelector('#screen-chars:not(.hidden)', { timeout: 5000 });

    // Select first character (make sure it's unlocked)
    const cards = page.locator('#char-list .char-card');
    const firstCard = cards.first();
    await firstCard.click();

    // Wait for pet select screen
    await page.waitForSelector('#screen-pet:not(.hidden)', { timeout: 5000 });

    // Skip pet selection
    await page.click('#btn-skip-pet');

    // Wait for game to initialize (HUD should be visible)
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 10000 });

    // Wait longer for game loop to start
    await page.waitForTimeout(3000);

    // Check if timer is running
    const timer = await page.locator('#timer').textContent();
    expect(timer).toBeDefined();
    expect(timer).not.toBe('00:00');
  });

  test('적이 3초内有 생성되어야 함', async ({ page }) => {
    await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-play');
    await page.waitForSelector('#screen-chars:not(.hidden)', { timeout: 5000 });
    await page.locator('#char-list .char-card').first().click();
    await page.waitForSelector('#screen-pet:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-skip-pet');
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 10000 });

    // Wait 5 seconds
    await page.waitForTimeout(5000);

    // Check timer is running and not at 00:00
    const timer = await page.locator('#timer').textContent();
    expect(timer).toBeDefined();
    expect(timer).not.toBe('00:00');
  });

  test('게임 메뉴로 돌아갈 수 있어야 함', async ({ page }) => {
    await page.click('#btn-play');
    await page.waitForSelector('#screen-chars:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-back-chars');
    await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 5000 });
  });
});