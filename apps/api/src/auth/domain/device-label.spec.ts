import { describeDevice } from './device-label.js';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  chromeLinux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edgeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
};

describe('describeDevice', () => {
  it.each([
    [UA.chromeWindows, 'Chrome · Windows'],
    [UA.edgeWindows, 'Edge · Windows'],
    [UA.operaWindows, 'Opera · Windows'],
    [UA.firefoxLinux, 'Firefox · Linux'],
    [UA.chromeLinux, 'Chrome · Linux'],
    [UA.safariMac, 'Safari · macOS'],
    [UA.chromeMac, 'Chrome · macOS'],
    [UA.safariIphone, 'Safari · iOS'],
    [UA.chromeIphone, 'Chrome · iOS'],
    [UA.chromeAndroid, 'Chrome · Android'],
    [UA.samsungAndroid, 'Samsung Internet · Android'],
    [UA.firefoxAndroid, 'Firefox · Android'],
    [UA.chromeOs, 'Chrome · ChromeOS'],
    [UA.edgeAndroid, 'Edge · Android'],
  ])('reconhece o aparelho (%#)', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it('o iPhone não vira macOS e o Android não vira Linux, mesmo citando os dois', () => {
    expect(describeDevice(UA.safariIphone)).toContain('iOS');
    expect(describeDevice(UA.safariIphone)).not.toContain('macOS');
    expect(describeDevice(UA.chromeAndroid)).toContain('Android');
    expect(describeDevice(UA.chromeAndroid)).not.toContain('Linux');
  });

  it('o Edge e o Opera não viram Chrome, e o Chrome não vira Safari', () => {
    expect(describeDevice(UA.edgeWindows)).toMatch(/^Edge/);
    expect(describeDevice(UA.operaWindows)).toMatch(/^Opera/);
    expect(describeDevice(UA.chromeWindows)).toMatch(/^Chrome/);
  });

  it('só o navegador, ou só o sistema, ainda ajuda a reconhecer', () => {
    expect(describeDevice('Firefox/127.0')).toBe('Firefox');
    expect(describeDevice('Algo (Windows NT 10.0)')).toBe('Windows');
  });

  it('ausente, vazio ou desconhecido vira "Dispositivo desconhecido"', () => {
    expect(describeDevice(undefined)).toBe('Dispositivo desconhecido');
    expect(describeDevice(null)).toBe('Dispositivo desconhecido');
    expect(describeDevice('')).toBe('Dispositivo desconhecido');
    expect(describeDevice('LifeXP-Teste/1.0')).toBe('Dispositivo desconhecido');
  });

  it('nunca devolve o texto original nem passa de 80 caracteres', () => {
    const long = `${UA.chromeWindows} ${'x'.repeat(400)}`;
    const label = describeDevice(long);
    expect(label.length).toBeLessThanOrEqual(80);
    expect(label).not.toContain('Mozilla');
  });
});
