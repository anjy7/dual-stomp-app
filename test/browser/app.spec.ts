import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
test('demo, fret filter, stop and responsive layout', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/practice/notes');
  await page.getByRole('button', {name:'Demo',exact:true}).click();
  await expect(page.locator('#note')).toHaveText('A2');
  await expect(page.locator('#frequency')).toHaveText(/110\.\d Hz/);
  await expect(page.locator('.fret-cell.active')).toHaveCount(2);
  await page.locator('#string').selectOption('6');
  await expect(page.locator('.fret-cell.active')).toHaveCount(1);
  await page.locator('#practice').click();
  await expect(page.locator('#status')).toContainText('Stop the demo');
  await expect(page.locator('#hits')).toHaveText('0');
  await page.screenshot({path:'.scratch/desktop.png', fullPage:true});
  await page.getByRole('button', {name:'Stop',exact:true}).click();
  await expect(page.locator('#note')).toHaveText('—');
  await expect(page.locator('.fret-cell.active')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'.scratch/mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('permission rejection is visible and retry stays possible', async ({page}) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied','NotAllowedError'); }; });
  await page.goto('/'); await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText('Microphone access denied');
  await expect(page.locator('#start')).toBeEnabled();
});
test('simulated capture: pitch scoring, silence, disconnect and cleanup', async ({page}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(); await ctx.resume();
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), destination = ctx.createMediaStreamDestination();
      oscillator.frequency.value = 110; gain.gain.value = .3;
      oscillator.connect(gain).connect(destination); oscillator.start();
      window.fixture = {ctx, oscillator, gain, stream:destination.stream};
      return destination.stream;
    };
  });
  await page.goto('/#/practice/notes'); await page.locator('#start').click();
  await expect(page.locator('#note')).toHaveText('A2');
  await page.locator('#practice').click();
  const target = (await page.locator('#target').textContent())!.replace('Find ', '');
  const frequencies: Record<string, number> = { E2:82.406889, A2:110, D3:146.832384, G3:195.997718, B3:246.941651, E4:329.627557 };
  await page.evaluate(f => window.fixture.oscillator.frequency.value = f, frequencies[target]);
  await expect(page.locator('#hits')).toHaveText('1');
  await expect(page.locator('#best')).toHaveText('1');
  await page.evaluate(() => window.fixture.gain.gain.value = 0);
  await expect(page.locator('#note')).toHaveText('—');
  await page.evaluate(() => window.fixture.stream.getTracks()[0].dispatchEvent(new Event('ended')));
  await expect(page.locator('#status')).toContainText('disconnected');
  expect(await page.evaluate(() => window.fixture.stream.getTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('#start')).toBeEnabled();
  await page.evaluate(() => window.fixture.ctx.close());
});
