import type { Page } from '@playwright/test';
import {test,expect} from '@playwright/test';
import {navigate} from './navigation-helpers.js';
async function capture(page: Page){await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=new AudioContext();await c.resume();const o=c.createOscillator(),g=c.createGain(),d=c.createMediaStreamDestination();o.frequency.value=233.08188;g.gain.value=.25;o.connect(g).connect(d);o.start();window.audioFixture={c,o,g};return d.stream;};});}
test('solo matching, repeated attacks, bend hold, progress and recording lifecycle',async({page})=>{
 const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));await capture(page);await page.goto('/');await page.locator('#start').click();
 await page.locator('#lesson-start').click();await expect(page.locator('#lesson-target')).toContainText('2/');
 await page.waitForTimeout(400);await expect(page.locator('#lesson-target')).toContainText('2/');
 await page.evaluate(()=>window.audioFixture.g.gain.value=0);await page.waitForTimeout(250);await page.evaluate(()=>window.audioFixture.g.gain.value=.25);await expect(page.locator('#lesson-target')).toContainText('3/');
 await expect(page.locator('#progress-summary')).toContainText('2 pitch targets matched');
 await navigate(page,'practice/bends');await page.locator('#bend-string').selectOption('2');await page.locator('#bend-fret').fill('10');await page.locator('#bend-fret').dispatchEvent('change');
 await page.evaluate(()=>window.audioFixture.o.frequency.value=349.22823);await expect(page.locator('#bend-reading')).toContainText('armed');
 await page.evaluate(()=>window.audioFixture.o.frequency.value=391.99544);await expect(page.locator('#progress-summary')).toContainText('1 bend targets held');
 await navigate(page,'recordings');await page.locator('#record').click();await expect(page.locator('#record-status')).toContainText('Recording guitar');
 await page.waitForTimeout(700);await page.locator('#record-stop').click();await expect(page.locator('#record-status')).toContainText('Take ready');await expect(page.locator('#download')).toBeVisible();
 expect(await page.locator('#playback').getAttribute('src')).toMatch(/^blob:/);
 await page.locator('#record').click();await page.waitForTimeout(300);await page.locator('#stop').click();await expect(page.locator('#record')).toBeEnabled();await expect(page.locator('#lesson-start')).toHaveText('Start phrase');
 await page.locator('#delete-takes').click();await expect(page.locator('#download')).toBeHidden();
 await page.evaluate(()=>window.audioFixture.c.close());expect(errors).toEqual([]);
});
test('demo gating, metronome, local setup, storage errors and responsive studio',async({page})=>{
 const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#demo').click();await page.locator('#lesson-start').click();await expect(page.locator('#lesson-detail')).toContainText('not demo');
 await navigate(page,'recordings');await page.locator('#record').click();await expect(page.locator('#record-status')).toContainText('Start listening');
 await navigate(page,'practice');await page.locator('#phrase').selectOption('9');await navigate(page,'practice/timing');await page.locator('#bpm').fill('90');await navigate(page,'settings');await page.locator('#save-setup').click();await navigate(page,'practice');await page.locator('#phrase').selectOption('0');await navigate(page,'settings');await page.locator('#load-setup').click();await expect(page.locator('#phrase')).toHaveValue('9');
 await navigate(page,'practice/timing');await page.locator('#metro').click();await expect(page.locator('#beat')).toContainText('90 BPM');await page.waitForTimeout(200);await page.locator('#tap').click();await expect(page.locator('#timing')).toContainText('Tap:');await page.locator('#metro').click();await expect(page.locator('#beat')).toHaveText('Stopped');
 await navigate(page,'settings');await page.evaluate(()=>localStorage.setItem('guitar-lab-setup',JSON.stringify({phrase:'',bpm:'90',latency:'0','bend-string':'0','bend-fret':'15','bend-step':'2'})));await page.locator('#load-setup').click();await expect(page.locator('#setup-status')).toContainText('Invalid');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.scratch/studio-mobile.png',fullPage:true});expect(errors).toEqual([]);
});
test('studio survives unavailable storage and recording support',async({page})=>{
 await capture(page);await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('blocked');};Storage.prototype.setItem=()=>{throw new Error('blocked');};Object.defineProperty(window,'MediaRecorder',{value:undefined,configurable:true});});
 await page.goto('/#/settings');await expect(page.locator('#progress-summary')).toContainText('storage unavailable');await page.locator('#save-setup').click();await expect(page.locator('#setup-status')).toContainText('storage unavailable');
 await page.locator('#start').click();await navigate(page,'recordings');await page.locator('#record').click();await expect(page.locator('#record-status')).toContainText('unsupported');await page.locator('#stop').click();await page.evaluate(()=>window.audioFixture.c.close());
});
test('footswitch learns non-tuner messages only and manually advances',async({page})=>{
 await capture(page);await page.goto('/');await page.locator('#start').click();await page.locator('#phrase').selectOption('9');await page.locator('#lesson-start').click();
 await navigate(page,'settings');await page.locator('#settings-foot summary').click();await page.locator('#foot-learn').click();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pedal-message',{detail:[176,69,1]})));await expect(page.locator('#foot-status')).toContainText('Waiting');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pedal-message',{detail:[176,20,127]})));await expect(page.locator('#foot-status')).toContainText('Mapped');await page.waitForTimeout(400);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('pedal-message',{detail:[176,20,127]})));await expect(page.locator('#lesson-target')).toContainText('2/');await expect(page.locator('#progress-summary')).toContainText('1 manually skipped');
 await page.locator('#stop').click();await page.evaluate(()=>window.audioFixture.c.close());
});
