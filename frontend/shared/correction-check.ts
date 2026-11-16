/** Bỏ chờ một kết quả AI; phản hồi muộn không được dùng để tạo job. */
export function skippableCorrection<T>(call: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let resolveSkip!: (value: null) => void;
  const skipped = new Promise<null>(resolve => { resolveSkip = resolve; });
  const cancel = () => { resolveSkip(null); controller.abort(); };
  return {
    result: Promise.race([call(controller.signal), skipped]),
    skip: cancel,
    abort: cancel,
  };
}

export function correctionNotice(reason?: string) {
  if (reason === 'GEMINI_QUOTA' || reason === 'GEMINI_DAILY_LIMIT')
    return 'Hết lượt kiểm tra chính tả. Dùng nguyên văn.';
  if (reason === 'GEMINI_TIMEOUT')
    return 'Kiểm tra chính tả quá hạn. Dùng nguyên văn.';
  return 'Chưa kiểm tra được chính tả. Dùng nguyên văn.';
}
