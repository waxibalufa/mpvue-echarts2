import Vue from 'vue'

/** Echarts Component */
export declare class MpvueEcharts extends Vue {
  echarts: object
  forceUseOldCanvas?: boolean
  canvasId?: string
  onInit?: () => object
  lazyLoad?: boolean
  disableTouch?: boolean
  throttleTouch?: boolean
}
