// src/jobs/enrich/types.ts
import type { EmailSource } from "../../../shared/models/supplier_contacts";

export interface ContactCandidate { email: string; source: EmailSource; confidence: number }
export interface ResolverResult { emails: ContactCandidate[]; website?: string | null; phone?: string | null }
export interface ResolverInput { supplierId: string; rut: string; name: string; website?: string | null }
export interface ContactResolver { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }
