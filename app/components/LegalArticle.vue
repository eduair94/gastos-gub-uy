<script setup lang="ts">
// Renders a LegalDoc (privacy / terms) as readable long-form. Paragraphs
// beginning "- " become list items; consecutive ones are grouped into one list.
import type { LegalDoc } from '~/utils/legal-content'

const props = defineProps<{ doc: LegalDoc }>()
const { t } = useI18n()

interface Block { type: 'p' | 'ul', items: string[] }

/** Fold a flat paragraph list into <p> blocks and grouped <ul> blocks. */
function toBlocks(body: string[]): Block[] {
  const blocks: Block[] = []
  for (const line of body) {
    const isBullet = line.startsWith('- ')
    const last = blocks[blocks.length - 1]
    if (isBullet) {
      const text = line.slice(2)
      if (last?.type === 'ul') last.items.push(text)
      else blocks.push({ type: 'ul', items: [text] })
    }
    else {
      blocks.push({ type: 'p', items: [line] })
    }
  }
  return blocks
}

const sections = computed(() => props.doc.sections.map(s => ({ heading: s.heading, blocks: toBlocks(s.body) })))
</script>

<template>
  <article class="legal">
    <header class="legal__head">
      <h1>{{ doc.title }}</h1>
      <p class="legal__updated u-mono">
        {{ t('legalPage.updated', { date: doc.updated }) }}
      </p>
    </header>

    <div class="legal__intro">
      <p
        v-for="(p, i) in doc.intro"
        :key="`intro-${i}`"
      >
        {{ p }}
      </p>
    </div>

    <section
      v-for="(sec, si) in sections"
      :key="`sec-${si}`"
      class="legal__sec"
    >
      <h2>{{ sec.heading }}</h2>
      <template
        v-for="(block, bi) in sec.blocks"
        :key="`b-${si}-${bi}`"
      >
        <ul v-if="block.type === 'ul'">
          <li
            v-for="(li, li2) in block.items"
            :key="li2"
          >
            {{ li }}
          </li>
        </ul>
        <p v-else>
          {{ block.items[0] }}
        </p>
      </template>
    </section>

    <slot />
  </article>
</template>

<style scoped>
.legal { max-width: 68ch; }

.legal__head { margin-bottom: var(--s-6); }
.legal__head h1 { margin: 0 0 var(--s-2); }

.legal__updated {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.legal__intro p {
  margin: 0 0 var(--s-3);
  color: var(--text);
  line-height: 1.7;
  font-size: var(--t-md);
}

.legal__sec {
  margin-top: var(--s-6);
  padding-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.legal__sec h2 {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xl);
}

.legal__sec p {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  line-height: 1.7;
}

.legal__sec ul {
  margin: 0 0 var(--s-3);
  padding-left: var(--s-5);
  color: var(--text-muted);
  line-height: 1.7;
}

.legal__sec li { margin-bottom: var(--s-1); }

.legal__sec p:last-child,
.legal__sec ul:last-child { margin-bottom: 0; }
</style>
