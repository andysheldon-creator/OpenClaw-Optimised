/**
 * Re-export shim – delegates to the crypto/ submodule so that
 * `import { … } from "./crypto.js"` keeps working.
 */

export {
  decodeEncodingAESKey,
  pkcs7Unpad,
  decryptWecomEncrypted,
  encryptWecomPlaintext,
  computeWecomMsgSignature,
  verifyWecomSignature,
} from "./crypto/index.js";

// Legacy alias: older callers reference WECOM_PKCS7_BLOCK_SIZE from this module.
// The canonical constant lives in types/constants.ts as CRYPTO.PKCS7_BLOCK_SIZE.
import { CRYPTO } from "./types/constants.js";
export const WECOM_PKCS7_BLOCK_SIZE = CRYPTO.PKCS7_BLOCK_SIZE;
