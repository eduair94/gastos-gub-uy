import { CHANNELS, type Channel } from '~/data/canales-youtube'
import { SAMPLED_ON, SAMPLES, type ChannelSample } from '~/data/canales-youtube-muestra'

/**
 * Las cifras de un canal: las vivas si el job ya pasó, las curadas si no.
 *
 * El directorio tiene dos mitades. La CURADA —quién entra y con qué prueba— vive
 * en el módulo de datos y no la toca ningún job. Las CIFRAS envejecen solas, así
 * que un cron nocturno las reescribe en `youtube_channel_stats` y esto las
 * prefiere.
 *
 * La página nunca queda vacía: si el endpoint no responde, o si el canal se
 * agregó a mano después de la última corrida, se muestran las cifras del día en
 * que se verificó la tabla, y la fecha que se publica es esa.
 */
export interface LiveStat {
  channelId: string
  subscribers: string | null
  subscribersApprox: number
  videos: string | null
  views: string | null
  country: string | null
  lastUpload: string | null
  selfDescription: string | null
  joined: string | null
  sample: { n: number, topicHits: number, mentions: Record<string, number> }
  checkedAt: string
}

/** Lo que la ficha muestra, ya resuelto, con la fecha de cuándo se midió. */
export interface ResolvedChannel {
  subscribers: string | null
  subscribersApprox: number
  videos: string | null
  views: string | null
  lastUpload: string | null
  joined: string | null
  selfDescription: string | null
  sample: ChannelSample | null
  /** ISO o fecha corta: cuándo se tomaron estas cifras. */
  measuredOn: string
  /** `true` cuando salen del job y no de la tabla curada. */
  live: boolean
}

export function useChannelStats() {
  const { data } = useFetch<{ success: boolean, data: { stats: Record<string, LiveStat>, checkedAt: string | null } }>(
    '/api/canales-youtube/stats',
    { key: 'yt-channel-stats', default: () => ({ success: true, data: { stats: {}, checkedAt: null } }) },
  )

  const stats = computed(() => data.value?.data?.stats ?? {})
  const checkedAt = computed(() => data.value?.data?.checkedAt ?? null)

  function resolve(channel: Channel): ResolvedChannel {
    const live = stats.value[channel.id]
    const curated = SAMPLES[channel.id] ?? null

    if (!live) {
      return {
        subscribers: channel.subscribers,
        subscribersApprox: channel.subscribersApprox,
        videos: channel.videos,
        views: curated?.views ?? null,
        lastUpload: channel.lastUpload,
        joined: curated?.joined ?? null,
        selfDescription: curated?.selfDescription ?? null,
        sample: curated,
        measuredOn: SAMPLED_ON,
        live: false,
      }
    }

    return {
      subscribers: live.subscribers ?? channel.subscribers,
      subscribersApprox: live.subscribersApprox || channel.subscribersApprox,
      videos: live.videos ?? channel.videos,
      views: live.views ?? curated?.views ?? null,
      lastUpload: live.lastUpload ?? channel.lastUpload,
      joined: live.joined ?? curated?.joined ?? null,
      selfDescription: live.selfDescription ?? curated?.selfDescription ?? null,
      sample: live.sample?.n
        ? {
            n: live.sample.n,
            topicHits: live.sample.topicHits,
            mentions: live.sample.mentions as ChannelSample['mentions'],
            selfDescription: live.selfDescription ?? curated?.selfDescription ?? null,
            joined: live.joined ?? curated?.joined ?? null,
            views: live.views ?? curated?.views ?? null,
          }
        : curated,
      measuredOn: live.checkedAt ? String(live.checkedAt).slice(0, 10) : SAMPLED_ON,
      live: true,
    }
  }

  /** Orden por tamaño, usando la cifra viva cuando existe. */
  function bySize(a: Channel, b: Channel): number {
    return resolve(b).subscribersApprox - resolve(a).subscribersApprox
  }

  /** Cuánto de lo último toca gasto y política, entre 0 y 1. `null` sin muestra. */
  function topicShare(channel: Channel): number | null {
    const s = resolve(channel).sample
    if (!s || s.n === 0) return null
    return s.topicHits / s.n
  }

  const anyLive = computed(() => Object.keys(stats.value).length > 0)

  return { stats, checkedAt, resolve, bySize, topicShare, anyLive, channels: CHANNELS }
}
