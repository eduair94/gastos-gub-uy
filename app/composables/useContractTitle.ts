import type { ContractLike } from '../utils/contract'
import { contractTitle, contractTitleFallback } from '../utils/contract'

/**
 * Names a contract the way a reader would.
 *
 * `contractTitle` returns '' for a release with no subject of its own — a
 * clarification, an amendment, an adjustment. Printing a bare "Contrato"
 * there made the row look like broken data; naming the stage and the
 * tender it belongs to says what it actually is.
 *
 * Lives in a composable rather than `utils/contract.ts` because the
 * fallback needs `t`, and a hardcoded Spanish string in utils would break
 * the English locale. Three call sites had inlined the same six lines.
 */
export function useContractTitle() {
  const { t } = useI18n()

  return (c?: ContractLike | null): string => {
    if (!c) return ''
    const explicit = contractTitle(c)
    if (explicit) return explicit
    const fb = contractTitleFallback(c)
    return t(fb.key, fb.params)
  }
}
