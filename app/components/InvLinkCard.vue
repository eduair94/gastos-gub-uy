<script setup lang="ts">
/**
 * One investigation, as a card: the ink header with its emoji, the dek, the
 * tags, and the read-on line.
 *
 * The hub wrote this markup out fourteen times — twelve links, three
 * placeholders — and `empresas-senaladas` wrote two more with their copy typed
 * inline as `lang({ es, en })` literals in the template, where no locale file
 * can see them. Everything visible is a text parameter now.
 *
 *   <InvLinkCard
 *     :to="localePath('/investigaciones/casinos')"
 *     emoji="🏛️"
 *     :eyebrow="c.cardCasinos.eyebrow"
 *     :title="c.cardCasinos.title"
 *     :dek="c.cardCasinos.dek"
 *     :tags="c.cardCasinos.tags"
 *     :cta="c.readMore"
 *   />
 *
 * Without `to` it renders the "coming soon" state: same card, no link, no CTA.
 */
defineProps<{
  /** Internal route. Omit for an announced-but-unpublished piece. */
  to?: string
  emoji?: string
  eyebrow?: string
  title: string
  dek?: string
  tags?: readonly string[]
  /** Read-on line. Omitted when there is nothing to read yet. */
  cta?: string
}>()

const NuxtLinkComponent = resolveComponent('NuxtLink')
</script>

<template>
  <component
    :is="to ? NuxtLinkComponent : 'div'"
    :to="to"
    class="inv-icard"
    :class="{ 'inv-soon': !to }"
  >
    <div class="inv-icard__top">
      <div>
        <p
          v-if="eyebrow"
          class="inv-icard__eyebrow"
        >
          {{ eyebrow }}
        </p>
        <h3 class="inv-icard__title">
          {{ title }}
        </h3>
      </div>
      <div
        v-if="emoji"
        class="inv-icard__emoji"
        aria-hidden="true"
      >
        {{ emoji }}
      </div>
    </div>

    <div class="inv-icard__body">
      <p
        v-if="dek"
        class="inv-icard__dek"
      >
        {{ dek }}
      </p>
      <div
        v-if="tags?.length"
        class="inv-icard__tags"
      >
        <span
          v-for="tg in tags"
          :key="tg"
          class="inv-tagpill"
        >{{ tg }}</span>
      </div>
      <slot />
    </div>

    <div
      v-if="cta && to"
      class="inv-icard__cta"
    >
      {{ cta }} →
    </div>
  </component>
</template>
