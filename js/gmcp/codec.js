// Kodowanie i parsowanie pakietów GMCP (treść subnegocjacji telnet, opcja 0xC9).
import { IAC, SE, SB, OPT_GMCP } from '../net/telnet.js';
import { byteStringToBytes, utf8ToByteString } from '../net/transport.js';

const utf8 = new TextDecoder('utf-8', { fatal: false });

/** Buduje pełną sekwencję IAC SB GMCP <ścieżka> <json> IAC SE (bajt-string). */
export function encodeGmcp(path, payload) {
  const body = payload === undefined ? path : `${path} ${JSON.stringify(payload)}`;
  return String.fromCharCode(IAC, SB, OPT_GMCP)
    + utf8ToByteString(body)
    + String.fromCharCode(IAC, SE);
}

/**
 * Parsuje treść subnegocjacji GMCP (bez nagłówka opcji).
 * Zwraca { path, payload } lub null, gdy to nie GMCP / nie da się sparsować.
 */
export function parseGmcp(subnegBody) {
  if (!subnegBody || (subnegBody.charCodeAt(0) & 0xff) !== OPT_GMCP) return null;
  const body = utf8.decode(byteStringToBytes(subnegBody.slice(1)));

  const jsonStart = body.search(/[\s{[]/);
  let path, rawJson;
  if (jsonStart === -1) {
    path = body.trim();
    rawJson = '';
  } else {
    path = body.slice(0, jsonStart).trim();
    rawJson = body.slice(jsonStart).trim();
  }

  let payload;
  if (rawJson) {
    try {
      // literalne znaki ESC wewnątrz stringów JSON psują JSON.parse
      payload = JSON.parse(rawJson.replaceAll('\x1b', '\\u001b'));
    } catch (err) {
      console.warn('[gmcp] nieparsowalny payload', path, err);
      payload = rawJson;
    }
  }
  return { path: path.toLowerCase(), payload };
}

/** Dekoduje pole text z gmcp_msgs (base64 -> UTF-8), z awaryjnym fallbackiem. */
export function decodeGmcpMsgText(text) {
  if (typeof text !== 'string') return '';
  try {
    return utf8.decode(byteStringToBytes(atob(text)));
  } catch {
    return text; // tryb base64_gmcp_msgs jeszcze nieaktywny
  }
}
