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
  || !verifiedOnly.value
  || hasPhone.value
  || hasWebsite.value
  || origen.value !== 'todas')
</script>

<template>
  <div class="contact-filter-set">
    <div class="toolbar">
      <form
        class="find"
        role="search"
        @submit.prevent
      >
        <label
          class="u-sr-only"
          for="contact-q"
        >{{ t('common.search') }}</label>
        <v-icon
          class="find__icon"
          size="20"
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
      </form>

      <label
        v-if="showSort"
        class="toolbar__sort"
      >
        <span class="u-sr-only">{{ t('common.sortBy') }}</span>
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

    <div class="filters">
      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.origin') }}</span>
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

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.rupeStatus') }}</span>
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

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.rubro') }}</span>
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

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.dept') }}</span>
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

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.size') }}</span>
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

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('sup.filter.category') }}</span>
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

      <button
        v-if="hasFilters"
        class="filters__clear"
        type="button"
        @click="emit('clear')"
      >
        {{ t('contacts.filter.clear') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.find {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1 1 auto;
  min-width: 0;
  max-width: 420px;
  padding: var(--s-1) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease);
}

.find:focus-within { border-color: var(--celeste); }
.find__icon { color: var(--text-muted); flex: none; }

.find__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-2) 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
}

.find__input:focus { outline: none; }
.find__input::placeholder { color: var(--text-muted); }
.find__input::-webkit-search-cancel-button { display: none; }

.find__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.find__x:hover { color: var(--text); }
.toolbar__sort { margin-left: auto; }

.sel {
  max-width: 260px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  cursor: pointer;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.chk {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text);
  font-size: var(--t-sm);
  cursor: pointer;
}

.chk input {
  accent-color: var(--verde);
  cursor: pointer;
}

.filters__clear {
  padding: var(--s-1) var(--s-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--celeste-deep);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.filters__clear:hover { text-decoration: underline; }

@media (max-width: 640px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .find {
    max-width: none;
  }

  .toolbar__sort {
    margin-left: 0;
  }

  .toolbar__sort .sel {
    width: 100%;
    max-width: none;
  }
}
</style>
