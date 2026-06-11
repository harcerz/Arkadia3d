// Kodeki ramek WebSocket <-> bajt-string latin1 (1 znak = 1 bajt).
// Natywny endpoint Arkadii przesyła strumień telnet jako base64 w ramkach
// tekstowych; proxy przesyła surowe ramki binarne.

export const base64Codec = {
  name: 'base64',
  decode(frame) {
    if (typeof frame !== 'string') frame = bufferToByteString(frame);
    try {
      return atob(frame.trim());
    } catch {
      return frame; // serwer wysłał czysty tekst (nie powinno się zdarzyć)
    }
  },
  encode(byteString) {
    return btoa(byteString);
  },
};

export const binaryCodec = {
  name: 'binary',
  decode(frame) {
    if (typeof frame === 'string') return frame;
    return bufferToByteString(frame);
  },
  encode(byteString) {
    const out = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) out[i] = byteString.charCodeAt(i) & 0xff;
    return out;
  },
};

// Uwaga: celowo NIE używamy TextDecoder('latin1') — to windows-1252,
// które przekłamuje bajty 0x80-0x9F.
function bufferToByteString(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

// Tekst UTF-8 (string JS) -> bajt-string latin1 do wysyłki.
export function utf8ToByteString(text) {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

// Bajt-string latin1 -> Uint8Array (np. do TextDecoder).
export function byteStringToBytes(byteString) {
  const out = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) out[i] = byteString.charCodeAt(i) & 0xff;
  return out;
}
