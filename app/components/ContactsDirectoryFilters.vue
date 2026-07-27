<script setup lang="ts">
interface RubroFacet {
  classificationId: string
  label: string
  count: number
}

withDefaults(defineProps<{
  rubros: RubroFacet[]
  showSort?: boolean
}>(), {
  showSort: true,
})

const emit = defineEmits<{
  clear: []
  clearSearch: []
}>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<string>('sort', { required: true })
const origen = defineModel<string>('origen', { required: true })
const rupeEstado = defineModel<string>('rupeEstado', { required: true })
const rubro = defineModel<string>('rubro', { required: true })
const departamento = defineModel<string>('departamento', { required: true })
const tamano = defineModel<string>('tamano', { required: true })
const categoria = defineModel<string>('categoria', { required: true })
const deiOnly = defineModel<boolean>('deiOnly', { required: true })
const onlyDirect = defineModel<boolean>('onlyDirect', { required: true })
const verifiedOnly = defineModel<boolean>('verifiedOnly', { required: true })
const hasPhone = defineModel<boolean>('hasPhone', { required: true })
const hasWebsite = defineModel<boolean>('hasWebsite', { required: true })

const { t } = useI18n()

const departamentos = [
  'ARTIGAS', 'CANELONES', 'CERRO LARGO', 'COLONIA', 'DURAZNO', 'FLORES', 'FLORIDA',
  'LAVALLEJA', 'MALDONADO', 'MONTEVIDEO', 'PAYSANDU', 'RIO NEGRO', 'RIVERA', 'ROCHA',
  'SALTO', 'SAN JOSE', 'SORIANO', 'TACUAREMBO', 'TREINTA Y TRES',
]

const categorias = [
  'empresa', 'organismo-publico', 'persona', 'cooperativa', 'agencia-publicidad', 'productora',
  'medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica',
]
const rupeEstados = ['ACTIVO', 'BAJA DGI', 'BAJA VOLUNTARIA', 'EN INGRESO']

const categoriaItems = computed(() => [
  { title: t('sup.filter.categoryAny'), value: '' },
  ...categorias.map(value => ({ title: t(`sup.cat.${value}`), value })),
])

const hasFilters = computed(() =>
  !!rubro.value
  || !!departamento.value
  || !!tamano.value
  || !!categoria.value
  || !!rupeEstado.value
  || deiOnly.value
  || onlyDirect.value
  || verifiedOnly.value
  || hasPhone.value
  || hasWebsite.value
  || origen.value !== 'todas')

const activeFilterCount = computed(() => [
  rubro.value,
  departamento.value,
  tamano.value,
  categoria.value,
  rupeEstado.value,
  deiOnly.value,
  onlyDirect.value,
  verifiedOnly.value,
  hasPhone.value,
  hasWebsite.value,
  origen.value !== 'todas',
].filter(Boolean).length)
</script>

<template>
  <section
    class="contact-filter-set"
    aria-labelledby="contact-filters-title"
  >
    <header class="filter-head">
      <div>
        <h2 id="contact-filters-title">
          {{ t('filters.title') }}
        </h2>
        <p
          v-if="activeFilterCount"
          class="filter-head__count"
        >
          {{ t('filters.active', activeFilterCount) }}
        </p>
      </div>
      <button
        v-if="hasFilters"
        class="filters__clear"
        type="button"
        @click="emit('clear')"
      >
        <v-icon
          size="18"
          aria-hidden="true"
        >
          mdi-close
        </v-icon>
        {{ t('contacts.filter.clear') }}
      </button>
    </header>

    <div class="toolbar">
      <form
        class="find"
        role="search"
        @submit.prevent
      >
        <label
          class="field__label"
          for="contact-q"
        >{{ t('common.search') }}</label>
        <div class="find__control">
          <v-icon
            class="find__icon"
            size="20"
            aria-hidden="true"
          >
            mdi-magnify
          </v-icon>
          <input
            id="contact-q"
            v-model="search"
            class="find__input"
            type="search"
            :placeholder="t('contacts.searchPlaceholder')"
          >
          <button
            v-if="search"
            class="find__x"
            type="button"
            :aria-label="t('common.clear')"
            @click="emit('clearSearch')"
          >
            <v-icon size="18">
              mdi-close
            </v-icon>
          </button>
        </div>
      </form>

      <label
        v-if="showSort"
        class="field toolbar__sort"
      >
        <span class="field__label">{{ t('common.sortBy') }}</span>
        <select
          v-model="sort"
          class="sel"
        >
          <option value="priorityDesc">
            {{ t('contacts.sort.priorityDesc') }}
          </option>
          <option value="nameAsc">
            {{ t('contacts.sort.nameAsc') }}
          </option>
        </select>
      </label>
    </div>

    <fieldset class="filter-group">
      <legend>{{ t('contacts.filter.facets') }}</legend>
      <div class="facet-grid">
        <label class="field">
          <span class="field__label">{{ t('contacts.filter.origin') }}</span>
          <select
            v-model="origen"
            class="sel"
          >
            <option value="todas">
              {{ t('contacts.filter.originTodas') }}
            </option>
            <option value="con-email">
              {{ t('contacts.filter.originConEmail') }}
            </option>
            <option value="sin-adjudicaciones">
              {{ t('contacts.filter.originSinAdjudicaciones') }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('contacts.filter.rupeStatus') }}</span>
          <select
            v-model="rupeEstado"
            class="sel"
          >
            <option value="">
              {{ t('contacts.filter.rupeStatusAny') }}
            </option>
            <option
              v-for="estado in rupeEstados"
              :key="estado"
              :value="estado"
            >
              {{ estado }}
            </option>
          </select>
        </label>

        <label class="field field--rubro">
          <span class="field__label">{{ t('contacts.filter.rubro') }}</span>
          <select
            v-model="rubro"
            class="sel"
          >
            <option value="">
              {{ t('contacts.filter.rubroAny') }}
            </option>
            <option
              v-for="item in rubros"
              :key="item.classificationId"
              :value="item.classificationId"
            >
              {{ item.label || item.classificationId }} ({{ formatNumber(item.count) }})
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('contacts.filter.dept') }}</span>
          <select
            v-model="departamento"
            class="sel"
          >
            <option value="">
              {{ t('contacts.filter.deptAny') }}
            </option>
            <option
              v-for="item in departamentos"
              :key="item"
              :value="item"
            >
              {{ item }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('contacts.filter.size') }}</span>
          <select
            v-model="tamano"
            class="sel"
          >
            <option value="">
              {{ t('contacts.filter.sizeAny') }}
            </option>
            <option value="micro">
              {{ t('sup.dei.size.micro') }}
            </option>
            <option value="pequena">
              {{ t('sup.dei.size.pequena') }}
            </option>
            <option value="mediana">
              {{ t('sup.dei.size.mediana') }}
            </option>
            <option value="gran">
              {{ t('sup.dei.size.gran') }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">{{ t('sup.filter.category') }}</span>
          <select
            v-model="categoria"
            class="sel"
          >
            <option
              v-for="item in categoriaItems"
              :key="item.value"
              :value="item.value"
            >
              {{ item.title }}
            </option>
          </select>
        </label>
      </div>
    </fieldset>

    <fieldset class="filter-group filter-group--conditions">
      <legend>{{ t('contacts.filter.availability') }}</legend>
      <div class="condition-grid">
        <label class="chk">
          <input
            v-model="deiOnly"
            type="checkbox"
          >
          <span>{{ t('contacts.filter.deiOnly') }}</span>
        </label>
        <label class="chk">
          <input
            v-model="onlyDirect"
            type="checkbox"
          >
          <span>{{ t('contacts.filter.onlyDirect') }}</span>
        </label>
        <label class="chk">
          <input
            v-model="verifiedOnly"
            type="checkbox"
          >
          <span>{{ t('contacts.filter.verifiedOnly') }}</span>
        </label>
        <label class="chk">
          <input
            v-model="hasPhone"
            type="checkbox"
          >
          <span>{{ t('contacts.filter.hasPhone') }}</span>
        </label>
        <label class="chk">
          <input
            v-model="hasWebsite"
            type="checkbox"
          >
          <span>{{ t('contacts.filter.hasWebsite') }}</span>
        </label>
      </div>
    </fieldset>
  </section>
</template>

<style scoped>
.contact-filter-set {
  container: contact-filters / inline-size;
  padding: var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.filter-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule);
}

.filter-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
}

.filter-head__count {
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 18rem);
  align-items: end;
  gap: var(--s-4);
  margin-bottom: var(--s-5);
}

.find {
  display: grid;
  min-width: 0;
  gap: var(--s-2);
}

.find__control {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
  min-height: 44px;
  padding-inline: var(--s-3) var(--s-1);
  background: var(--surface-sunken);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease);
}

.find__control:focus-within {
  border-color: var(--focus);
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.find__icon { color: var(--text-muted); flex: none; }

.find__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-2) 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-base);
}

.find__input:focus { outline: none; }
.find__input::placeholder { color: var(--text-muted); }
.find__input::-webkit-search-cancel-button { display: none; }

.find__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.find__x:hover {
  background: var(--celeste-wash);
  color: var(--celeste-deep);
}

.field {
  display: grid;
  min-width: 0;
  gap: var(--s-2);
}

.field__label,
.filter-group legend {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.03em;
}

.sel {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  cursor: pointer;
}

.filter-group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.filter-group legend {
  margin-bottom: var(--s-3);
  padding: 0;
}

.facet-grid {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1fr)
    minmax(0, 2fr)
    repeat(3, minmax(0, 1fr));
  gap: var(--s-3);
}

.field--rubro {
  min-width: 0;
}

.filter-group--conditions {
  margin-top: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
}

.condition-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.chk {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
  color: var(--text);
  font-size: var(--t-sm);
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}

.chk:hover {
  border-color: var(--celeste);
}

.chk:has(input:checked) {
  border-color: var(--celeste);
  background: var(--celeste-wash);
}

.chk:has(input:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.chk input {
  width: 1rem;
  height: 1rem;
  flex: none;
  margin: 0;
  accent-color: var(--verde);
  cursor: pointer;
}

.filters__clear {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: transparent;
  color: var(--celeste-deep);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.filters__clear:hover {
  border-color: var(--celeste);
  background: var(--celeste-wash);
}

@container contact-filters (max-width: 62rem) {
  .facet-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container contact-filters (max-width: 48rem) {
  .toolbar {
    grid-template-columns: 1fr;
    gap: var(--s-3);
  }

  .facet-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container contact-filters (max-width: 34rem) {
  .contact-filter-set {
    padding: var(--s-3);
  }

  .filter-head {
    align-items: stretch;
    flex-direction: column;
  }

  .filters__clear {
    width: 100%;
    justify-content: center;
  }

  .facet-grid {
    grid-template-columns: 1fr;
  }

  .condition-grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .chk {
    width: 100%;
  }
}
</style>
