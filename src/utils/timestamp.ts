import { computeSHA256 } from './hash'

/**
 * RFC 3161 Timestamp Request via FreeTSA.
 *
 * 1. Compute SHA-256 of the PDF
 * 2. Build ASN.1 DER TimeStampReq (RFC 3161)
 * 3. Send to FreeTSA via HTTPS
 * 4. Return the .tsr token as ArrayBuffer
 */

/**
 * Build a minimal ASN.1 DER-encoded TimeStampReq.
 *
 * TimeStampReq ::= SEQUENCE {
 *   version          INTEGER { v1(1) },
 *   messageImprint   MessageImprint,
 *   certReq          BOOLEAN DEFAULT FALSE
 * }
 *
 * MessageImprint ::= SEQUENCE {
 *   hashAlgorithm    AlgorithmIdentifier (SHA-256 = 2.16.840.1.101.3.4.2.1),
 *   hashedMessage    OCTET STRING
 * }
 */
function buildTimestampRequest(sha256Hex: string): Uint8Array {
  const hashBytes = new Uint8Array(
    sha256Hex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  )

  // SHA-256 OID: 2.16.840.1.101.3.4.2.1
  const sha256Oid = new Uint8Array([
    0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
  ])

  // AlgorithmIdentifier SEQUENCE { oid, NULL }
  const algId = asn1Sequence([sha256Oid, new Uint8Array([0x05, 0x00])])

  // MessageImprint SEQUENCE { algId, OCTET STRING hash }
  const hashedMessage = asn1OctetString(hashBytes)
  const messageImprint = asn1Sequence([algId, hashedMessage])

  // version INTEGER 1
  const version = new Uint8Array([0x02, 0x01, 0x01])

  // certReq BOOLEAN TRUE
  const certReq = new Uint8Array([0x01, 0x01, 0xff])

  // TimeStampReq SEQUENCE
  return asn1Sequence([version, messageImprint, certReq])
}

function asn1Sequence(items: Uint8Array[]): Uint8Array {
  const content = concatArrays(items)
  return asn1Tag(0x30, content)
}

function asn1OctetString(data: Uint8Array): Uint8Array {
  return asn1Tag(0x04, data)
}

function asn1Tag(tag: number, content: Uint8Array): Uint8Array {
  const len = asn1Length(content.length)
  const result = new Uint8Array(1 + len.length + content.length)
  result[0] = tag
  result.set(len, 1)
  result.set(content, 1 + len.length)
  return result
}

function asn1Length(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length])
  if (length < 256) return new Uint8Array([0x81, length])
  return new Uint8Array([0x82, (length >> 8) & 0xff, length & 0xff])
}

function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((s, a) => s + a.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Request an RFC 3161 timestamp token from FreeTSA.
 * Returns the .tsr file content as ArrayBuffer.
 */
export async function requestTimestamp(pdfBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  // 1. Hash the PDF
  const hashBuffer = await crypto.subtle.digest('SHA-256', pdfBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const sha256Hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  // 2. Build TSQ (TimeStamp Query)
  const tsq = buildTimestampRequest(sha256Hex)

  // 3. Send via CORS-proxy (FreeTSA doesn't support CORS)
  const TSA_PROXY = 'https://yanjjiuucyagyytksuqz.supabase.co/functions/v1/tsa-proxy'

  const response = await fetch(TSA_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/timestamp-query',
    },
    body: tsq.buffer as ArrayBuffer,
  })

  if (!response.ok) {
    throw new Error(`TSA-Anfrage fehlgeschlagen: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('Content-Type')
  if (contentType && !contentType.includes('timestamp-reply')) {
    throw new Error(`Unerwarteter Content-Type: ${contentType}`)
  }

  return response.arrayBuffer()
}

/**
 * Compute SHA-256 of PDF for display in the export UI.
 */
export async function computePdfHash(pdfBuffer: ArrayBuffer): Promise<string> {
  return computeSHA256(pdfBuffer)
}
