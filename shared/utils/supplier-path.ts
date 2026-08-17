/**
 * The ONE way to build a `/suppliers/...` URL.
 *
 * WARNING: a supplier id carries a slash (`R/210002980010`, `C/1.018.225-6`,
 * `X/CHECHE-103.194.266`) and that slash is a PATH SEPARATOR, not a character to
 * escape. `encodeURIComponent(id)` turns it into `%2F` and yields a second,
 * different URL for the same supplier.
 *
 * That is exactly what the supplier sitemap did. It listed 43,015 URLs shaped
 * `/suppliers/C%2F0000` while the page itself canonicalised to
 * `/suppliers/C/0000`. Both answered 200, so Google filed the whole sitemap
 * under "Alternate page with proper canonical tag" — the site submitted its
 * largest entity family and disavowed every row of it.
 *
 * Split on the slash, encode each SEGMENT, rejoin with a real slash.
 *
 * This is for the PAGE path only. The API route `/api/suppliers/:id` takes the
 * id as one segment and still needs a whole-string `encodeURIComponent`.
 */
export function supplierPath(id: string): string {
  return `/suppliers/${id.split("/").map(encodeURIComponent).join("/")}`;
}
