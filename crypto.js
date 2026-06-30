// Camada extra de criptografia ponta a ponta, em cima do canal P2P do WebRTC.
// O WebRTC (DataChannel) já é criptografado nativamente via DTLS, mas aqui
// adicionamos uma camada de aplicação (ECDH + AES-GCM) para que nem mesmo
// alguém com acesso ao tráfego de rede consiga ler o conteúdo: as chaves
// privadas nunca saem do navegador de cada usuário.

async function generateKeyPair() {
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );
}

async function exportPublicKeyJwk(keyPair) {
  return window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
}

async function importPublicKeyJwk(jwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

async function deriveSharedKey(myPrivateKey, peerPublicKey) {
  return window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function encryptMessage(sharedKey, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  );
  return { ciphertext: bufToBase64(ciphertextBuf), iv: bufToBase64(iv) };
}

async function decryptMessage(sharedKey, ciphertextB64, ivB64) {
  const ciphertextBuf = base64ToBuf(ciphertextB64);
  const iv = new Uint8Array(base64ToBuf(ivB64));
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    ciphertextBuf
  );
  return new TextDecoder().decode(plainBuf);
}

function generateNickname() {
  const adjectives = ['Rapido', 'Calmo', 'Azul', 'Verde', 'Forte', 'Sereno', 'Sagaz', 'Vivido'];
  const animals = ['Tigre', 'Falcao', 'Lobo', 'Golfinho', 'Aguia', 'Panda', 'Raposa', 'Coruja'];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const b = animals[Math.floor(Math.random() * animals.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${a}${b}${n}`;
}
