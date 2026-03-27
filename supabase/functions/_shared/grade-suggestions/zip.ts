export type ZipEntries = Record<string, Uint8Array>

async function loadFflate() {
  return await import('fflate')
}

export async function unzipArchive(bytes: Uint8Array): Promise<ZipEntries> {
  const fflate = await loadFflate()
  return fflate.unzipSync(bytes)
}

export async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const fflate = await loadFflate()
  return fflate.unzlibSync(bytes)
}
