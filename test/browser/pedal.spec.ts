import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
async function fixture(page: Page, mode = 'ok') {
  await page.addInitScript(mode => {
    const port: import("./fixtures.js").MockPort = {name:'JME STOMPBOX',state:'connected',onmidimessage:null,closed:0,open:async()=>{},close:async()=>{port.closed = (port.closed ?? 0) + 1;}};
    const snapshot = [240,0,33,122,112,111,2,0,1,10,1,0,0,0,0,247];
    const sent: number[][]=[];
    const output = {name:'JME STOMPBOX',state:'connected',open:async()=>{},close:async()=>{},send:(packet: number[])=>{
      sent.push([...packet]);
      if(packet[5]!==111) throw new Error('Unexpected command');
      if(packet[6]===1) snapshot[7]=packet[7];
      const response=packet[6]===0 ? [...snapshot] : [240,0,33,122,112,111,3,1,0,0,0,0,0,0,0,247];
      if (!window.midiFixture.silent) queueMicrotask(()=>port.onmidimessage?.({data:response}));
    }};
    const access = {onstatechange:null as (() => void) | null,inputs:new Map(mode === 'missing' ? [] : [['jme',port]]), outputs:new Map([['jme-out',output]])};
    window.midiFixture = {port,access,output,snapshot,sent,options:null};
    navigator.requestMIDIAccess = async options => {
      window.midiFixture.options = options;
      if (mode === 'denied') throw new DOMException('Denied','NotAllowedError');
      return access as unknown as MIDIAccess;
    };
  }, mode);
}
test('pedal readings, stale clearing, audio independence and unplug/retry', async ({page}) => {
  const errors: string[] = []; page.on('pageerror',e => errors.push(e.message));
  await fixture(page); await page.goto('/#/pedal/tuner'); await page.locator('#pedal-connect').click();
  await expect(page.locator('#pedal-status')).toContainText('Connected to JME');
  expect(await page.evaluate(() => window.midiFixture.options)).toEqual({sysex:true});
  async function send(messages: number[][]) { await page.evaluate(messages => messages.forEach(data => window.midiFixture.port.onmidimessage!({data:new Uint8Array(data)})),messages); }
  await send([[176,69,1],[176,70,7],[176,72,30]]);
  await expect(page.locator('#pedal-note')).toHaveText('E');
  await expect(page.locator('#pedal-reading')).toContainText('Flat');
  await send([[176,72,50]]); await expect(page.locator('#pedal-reading')).toContainText('in tune');
  await send([[176,72,60]]); await expect(page.locator('#pedal-reading')).toContainText('Sharp');
  await page.locator('#demo').click(); await expect(page.locator('#note')).toHaveText('A2');
  await expect(page.locator('#pedal-note')).toHaveText('E');
  await expect(page.locator('#pedal-note')).toHaveText('—',{timeout:4000});
  await send([[176,72,50]]); await expect(page.locator('#pedal-note')).toHaveText('E');
  await send([[176,69,0]]); await expect(page.locator('#pedal-note')).toHaveText('—');
  await page.evaluate(() => { window.midiFixture.port.state='disconnected'; window.midiFixture.access.onstatechange?.(); });
  await expect(page.locator('#pedal-status')).toContainText('unplugged');
  await expect(page.locator('#pedal-connect')).toBeEnabled();
  expect(await page.evaluate(() => window.midiFixture.port.closed)).toBe(1);
  await page.evaluate(() => window.midiFixture.port.state='connected');
  await page.locator('#pedal-connect').click(); await send([[176,69,1],[176,70,0],[176,72,50]]);
  await expect(page.locator('#pedal-note')).toHaveText('A');
  await page.locator('#pedal-disconnect').click(); await expect(page.locator('#pedal-note')).toHaveText('—');
  expect(errors).toEqual([]);
});
test('web tuner On/Off preserves settings, confirms mode and reports timeout', async ({page}) => {
  await fixture(page); await page.goto('/#/pedal/tuner');
  await expect(page.locator('#pedal-on')).toBeDisabled();
  await page.locator('#pedal-connect').click();
  expect(await page.evaluate(()=>window.midiFixture.sent)).toEqual([]);
  await page.locator('#pedal-on').click();
  await expect(page.locator('#pedal-mode')).toHaveText('Tuner ON · confirmed by pedal');
  expect(await page.evaluate(()=>window.midiFixture.sent[1])).toEqual([240,0,33,122,112,111,1,1,1,10,1,0,0,0,0,247]);
  await page.locator('#pedal-off').click();
  await expect(page.locator('#pedal-mode')).toHaveText('Tuner OFF · confirmed by pedal');
  await page.evaluate(()=>window.midiFixture.silent=true);
  await page.locator('#pedal-on').click();
  await expect(page.locator('#pedal-on')).toBeDisabled();
  await expect(page.locator('#pedal-status')).toContainText('No tuner reply',{timeout:5000});
  await expect(page.locator('#pedal-mode')).toHaveText('Tuner state unknown');
  await expect(page.locator('#pedal-on')).toBeEnabled();
  const before=await page.evaluate(()=>window.midiFixture.sent.length);
  await page.locator('#pedal-disconnect').click();
  expect(await page.evaluate(()=>window.midiFixture.sent.length)).toBe(before);
});
for (const mode of ['denied','missing']) test(`MIDI ${mode}: clear error and retry`, async ({page}) => {
  await fixture(page,mode); await page.goto('/#/pedal/tuner'); await page.locator('#pedal-connect').click();
  await expect(page.locator('#pedal-status')).toContainText(mode === 'denied' ? 'permission denied' : 'No JME');
  await expect(page.locator('#pedal-connect')).toBeEnabled();
});
