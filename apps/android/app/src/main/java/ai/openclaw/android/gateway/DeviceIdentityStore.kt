package ai.openclaw.android.gateway

import android.content.Context
import android.util.Base64
import android.util.Log
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class DeviceIdentity(
  val deviceId: String,
  val publicKeyRawBase64: String,
  val privateKeyPkcs8Base64: String,
  val createdAtMs: Long,
  val keyAlgorithm: String = "unknown",
)

class DeviceIdentityStore(context: Context) {
  private val json = Json { ignoreUnknownKeys = true }
  private val identityFile = File(context.filesDir, "openclaw/identity/device.json")

  @Synchronized
  fun loadOrCreate(): DeviceIdentity {
    val existing = load()
    if (existing != null) {
      // Migrate old keys generated with wrong algorithm/digest params.
      // Old keys used "Ed25519" in AndroidKeyStore which silently created P-256 with
      // DIGEST_NONE — making SHA256withECDSA signing impossible.
      if (existing.privateKeyPkcs8Base64 == "__ANDROID_KEYSTORE__" && existing.keyAlgorithm != "ec_p256") {
        Log.i(TAG, "Migrating old KeyStore key (algo=${existing.keyAlgorithm}), regenerating as EC P-256")
        deleteOldKeystoreEntry()
        val fresh = generate()
        save(fresh)
        return fresh
      }
      val derived = deriveDeviceId(existing.publicKeyRawBase64)
      if (derived != null && derived != existing.deviceId) {
        val updated = existing.copy(deviceId = derived)
        save(updated)
        return updated
      }
      return existing
    }
    val fresh = generate()
    save(fresh)
    return fresh
  }

  fun signPayload(payload: String, identity: DeviceIdentity): String? {
    if (identity.privateKeyPkcs8Base64 == "__ANDROID_KEYSTORE__") {
      return signWithKeyStore(payload)
    }
    return try {
      val privateKeyBytes = Base64.decode(identity.privateKeyPkcs8Base64, Base64.DEFAULT)
      val keySpec = PKCS8EncodedKeySpec(privateKeyBytes)
      val keyFactory = KeyFactory.getInstance("Ed25519")
      val privateKey = keyFactory.generatePrivate(keySpec)
      val signature = Signature.getInstance("Ed25519")
      signature.initSign(privateKey)
      signature.update(payload.toByteArray(Charsets.UTF_8))
      base64UrlEncode(signature.sign())
    } catch (_: Throwable) {
      null
    }
  }

  fun publicKeyBase64Url(identity: DeviceIdentity): String? {
    return try {
      val raw = Base64.decode(identity.publicKeyRawBase64, Base64.DEFAULT)
      base64UrlEncode(raw)
    } catch (_: Throwable) {
      null
    }
  }

  private fun load(): DeviceIdentity? {
    return readIdentity(identityFile)
  }

  private fun readIdentity(file: File): DeviceIdentity? {
    return try {
      if (!file.exists()) return null
      val raw = file.readText(Charsets.UTF_8)
      val decoded = json.decodeFromString(DeviceIdentity.serializer(), raw)
      if (decoded.deviceId.isBlank() ||
        decoded.publicKeyRawBase64.isBlank() ||
        decoded.privateKeyPkcs8Base64.isBlank()
      ) {
        null
      } else {
        decoded
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun save(identity: DeviceIdentity) {
    try {
      identityFile.parentFile?.mkdirs()
      val encoded = json.encodeToString(DeviceIdentity.serializer(), identity)
      identityFile.writeText(encoded, Charsets.UTF_8)
    } catch (_: Throwable) {
      // best-effort only
    }
  }

  private fun generate(): DeviceIdentity {
    return generateUsingKeyStore()
  }

  private fun deriveDeviceId(publicKeyRawBase64: String): String? {
    return try {
      val raw = Base64.decode(publicKeyRawBase64, Base64.DEFAULT)
      sha256Hex(raw)
    } catch (_: Throwable) {
      null
    }
  }

  private fun sha256Hex(data: ByteArray): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(data)
    val out = StringBuilder(digest.size * 2)
    for (byte in digest) {
      out.append(String.format("%02x", byte))
    }
    return out.toString()
  }

  private fun base64UrlEncode(data: ByteArray): String {
    return Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }

  private val keystoreAlias = "openclaw_device_p256"
  private val oldKeystoreAlias = "openclaw_device_ed25519"

  /** Delete only the legacy Ed25519 alias. Called during migration. */
  private fun deleteOldKeystoreEntry() {
    try {
      val ks = java.security.KeyStore.getInstance("AndroidKeyStore")
      ks.load(null)
      if (ks.containsAlias(oldKeystoreAlias)) {
        ks.deleteEntry(oldKeystoreAlias)
      }
    } catch (_: Throwable) {}
  }

  /**
   * Return a DeviceIdentity backed by the Android KeyStore.
   * If a valid P-256 key already exists under [keystoreAlias], reuse it
   * (e.g., identity file was deleted/corrupted but the hardware key survived).
   * Only generates a new key when no usable entry is found.
   */
  private fun generateUsingKeyStore(): DeviceIdentity {
    // Try to reuse an existing P-256 KeyStore entry
    try {
      val ks = java.security.KeyStore.getInstance("AndroidKeyStore")
      ks.load(null)
      if (ks.containsAlias(keystoreAlias)) {
        val entry = ks.getEntry(keystoreAlias, null) as? java.security.KeyStore.PrivateKeyEntry
        if (entry != null) {
          val spki = entry.certificate.publicKey.encoded
          val deviceId = sha256Hex(spki)
          Log.i(TAG, "Reusing existing KeyStore entry, deviceId=${deviceId.take(8)}…")
          return DeviceIdentity(
            deviceId = deviceId,
            publicKeyRawBase64 = Base64.encodeToString(spki, Base64.NO_WRAP),
            privateKeyPkcs8Base64 = "__ANDROID_KEYSTORE__",
            createdAtMs = System.currentTimeMillis(),
            keyAlgorithm = "ec_p256",
          )
        }
      }
    } catch (_: Throwable) {
      // Fall through to generate a new key
    }

    // No usable entry — generate a fresh P-256 key
    val spec = android.security.keystore.KeyGenParameterSpec.Builder(
      keystoreAlias,
      android.security.keystore.KeyProperties.PURPOSE_SIGN or android.security.keystore.KeyProperties.PURPOSE_VERIFY
    )
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(android.security.keystore.KeyProperties.DIGEST_SHA256)
      .build()
    val kpg = KeyPairGenerator.getInstance("EC", "AndroidKeyStore")
    kpg.initialize(spec)
    val keyPair = kpg.generateKeyPair()
    val spki = keyPair.public.encoded // Full P-256 SPKI DER (91 bytes)
    val deviceId = sha256Hex(spki)
    return DeviceIdentity(
      deviceId = deviceId,
      publicKeyRawBase64 = Base64.encodeToString(spki, Base64.NO_WRAP),
      privateKeyPkcs8Base64 = "__ANDROID_KEYSTORE__",
      createdAtMs = System.currentTimeMillis(),
      keyAlgorithm = "ec_p256",
    )
  }

  fun signWithKeyStore(payload: String): String? {
    return try {
      val ks = java.security.KeyStore.getInstance("AndroidKeyStore")
      ks.load(null)
      val entry = ks.getEntry(keystoreAlias, null) as? java.security.KeyStore.PrivateKeyEntry ?: return null
      val signature = Signature.getInstance("SHA256withECDSA")
      signature.initSign(entry.privateKey)
      signature.update(payload.toByteArray(Charsets.UTF_8))
      val sigBytes = signature.sign()
      base64UrlEncode(sigBytes)
    } catch (e: Throwable) {
      Log.w(TAG, "signWithKeyStore failed", e)
      null
    }
  }

  companion object {
    private const val TAG = "DeviceIdentityStore"
    private val ED25519_SPKI_PREFIX =
      byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
      )
  }
}
