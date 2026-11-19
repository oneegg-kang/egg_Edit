/** 사진 파일의 원래 크기 (휴대폰 사진의 세로/가로 방향 정보도 반영됨) */
export function naturalSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('사진을 열 수 없어요'))
    }
    img.src = url
  })
}
