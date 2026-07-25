export interface SupplierMapPoint {
  supplierId: string
  rut: string
  name: string
  lat: number
  lng: number
  locality: string | null
  address: string | null
  placeSource: string | null
  rubro: string | null
  neverAwarded: boolean
  rupeEstado: string | null
}

export interface SupplierEvidenceEmail {
  email: string
  source: string
  sourceUrl: string | null
  mxValid: boolean
}

export interface SupplierEvidencePhone {
  phone: string
  source: string
  sourceUrl: string | null
}

export interface SupplierSocialLink {
  platform: string
  label: string
  url: string
  source: string
  sourceUrl: string | null
}

export interface SupplierDeiRecord {
  rut: string
  estado: string | null
  denominacionSocial: string | null
  nombreComercial: string | null
  tamano: string | null
  tiposActividad: string[]
  descripcionActividad: string | null
  ciiuPrincipal: string | null
  ciiuPrincipalDesc: string | null
  ciiuSecundarios: string[]
  departamento: string | null
  localidad: string | null
  direccion: string | null
  lat: number | null
  lng: number | null
  email: string | null
  sitioWeb: string | null
  telefono: string | null
  fechaRegistro: string | null
  fechaVencimiento: string | null
}

export interface SupplierRupeRecord {
  rut: string
  pais: string
  denominacionSocial: string
  domicilioFiscal: string | null
  localidad: string | null
  departamento: string | null
  estado: string
  lat: number | null
  lng: number | null
}

export interface SupplierProcurementSummary {
  totalContracts: number
  years: number[]
  yearCount: number
  buyers: Array<{
    id: string
    name: string
  }>
  buyerCount: number
  avgContractValue: number
  totalValue: number
  directAwardCount: number
  tenderAwardCount: number
  onlyDirectAward: boolean
  items: Array<{
    description: string
    category: string | null
    totalAmount: number
    totalQuantity: number
    contractCount: number
    avgPrice: number
    currency: string | null
    unitName: string | null
    year: number | null
  }>
  topCategories: Array<{
    category: string
    totalAmount: number
    contractCount: number
  }>
  lastUpdated: string | null
}

export interface SupplierBusinessDetail {
  supplierId: string
  rut: string
  name: string
  rubro: string | null
  rubros: Array<{ classificationId: string, label: string, share: number }>
  emails: SupplierEvidenceEmail[]
  phones: SupplierEvidencePhone[]
  website: string | null
  websiteSource: string | null
  websiteSourceUrl: string | null
  contactFormUrl: string | null
  socialLinks: SupplierSocialLink[]
  locality: string | null
  address: string | null
  websiteAddress: string | null
  placeSource: string | null
  hours: string | null
  mapsUrl: string | null
  lat: number | null
  lng: number | null
  methods: string[]
  neverAwarded: boolean
  rupeEstado: string | null
  dei: SupplierDeiRecord | null
  rupe: SupplierRupeRecord | null
  procurement: SupplierProcurementSummary | null
  meta: {
    contactUpdatedAt: string | null
    mapsEnrichedAt: string | null
  }
}

export interface SupplierBusinessDetailResponse {
  success: true
  data: SupplierBusinessDetail
}
