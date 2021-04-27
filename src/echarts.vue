<template>
  <canvas
    v-if="canvasId"
    :type="forceUseOldCanvas?'':'2d'"
    class="ec-canvas"
    :id="canvasId"
    :canvasId="canvasId"
    @touchstart="touchStart"
    @touchmove="touchMove"
    @touchend="touchEnd">
  </canvas>
</template>

<script>
import WxCanvas2 from './wx-canvas2';
import WxCanvas from './wx-canvas';

function compareVersion(v1s, v2s) {
  const v1 = v1s.split('.');
  const v2 = v2s.split('.');
  const len = Math.max(v1.length, v2.length);

  while (v1.length < len) {
    v1.push('0');
  }
  while (v2.length < len) {
    v2.push('0');
  }

  for (let i = 0; i < len; i += 1) {
    const num1 = parseInt(v1[i]);
    const num2 = parseInt(v2[i]);

    if (num1 > num2) {
      return 1;
    } else if (num1 < num2) {
      return -1;
    }
  }
  return 0;
}

function wrapTouch(e) {
  for (let i = 0; i < e.mp.touches.length; i += 1) {
    const touch = e.mp.touches[i];
    touch.offsetX = touch.x;
    touch.offsetY = touch.y;
  }
  return e;
}

export default {
  props: {
    echarts: {
      required: true,
      type: Object,
      default() {
        return null;
      },
    },
    forceUseOldCanvas: {
      type: Boolean,
      default: false,
    },
    canvasId: {
      type: String,
      default: 'ec-canvas',
    },
    onInit: {
      type: Function,
      default: null,
    },
    lazyLoad: {
      type: Boolean,
      default: false,
    },
    disableTouch: {
      type: Boolean,
      default: false,
    },
    throttleTouch: {
      type: Boolean,
      default: false,
    },
  },

  onReady() {
    if (!this.echarts) {
      console.warn('组件需绑定 echarts 变量，例：<ec-canvas id="mychart-dom-bar" '
        + 'canvas-id="mychart-bar" :echarts="echarts"></ec-canvas>');
      return;
    }

    if (!this.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init(callback) {
      const version = wx.getSystemInfoSync().SDKVersion;

      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      this.isUseNewCanvas = canUseNewCanvas && !this.forceUseOldCanvas;

      if (this.forceUseOldCanvas && canUseNewCanvas) {
        console.warn('开发者强制使用旧canvas,建议关闭');
      }

      if (this.isUseNewCanvas) {
        this.initByNewWay(callback);
      } else {
        const isValid = compareVersion(version, '1.9.91') >= 0;
        if (!isValid) {
          console.error('微信基础库版本过低，需大于等于 1.9.91。'
            + '参见：https://github.com/ecomfe/echarts-for-weixin'
            + '#%E5%BE%AE%E4%BF%A1%E7%89%88%E6%9C%AC%E8%A6%81%E6%B1%82');
        } else {
          console.warn('建议将微信基础库调整大于等于2.9.0版本。升级后绘图将有更好性能');
          this.initByOldWay(callback);
        }
      }
    },
    initByNewWay(callback) {
      // version >= 2.9.0：使用新的方式初始化
      const { canvasId } = this;
      const query = wx.createSelectorQuery();

      query
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvasNode = res[0].node;
          this.canvasNode = canvasNode;

          const canvasDpr = wx.getSystemInfoSync().pixelRatio;
          const canvasWidth = res[0].width;
          const canvasHeight = res[0].height;

          const ctx = canvasNode.getContext('2d');

          const canvas = new WxCanvas2(ctx, canvasId, true, canvasNode);
          this.echarts.setCanvasCreator(() => canvas);

          if (typeof callback === 'function') {
            this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
          } else if (typeof this.onInit === 'function') {
            this.chart = this.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
          } else {
            this.triggerEvent('init', {
              canvas,
              width: canvasWidth,
              height: canvasHeight,
              dpr: canvasDpr,
            });
          }
        });
    },
    initByOldWay(callback) {
      // 1.9.91 <= version < 2.9.0：原来的方式初始化
      const { canvasId } = this;
      this.ctx = wx.createCanvasContext(canvasId);

      const canvas = new WxCanvas(this.ctx, canvasId);

      this.echarts.setCanvasCreator(() => canvas);
      // const canvasDpr = wx.getSystemInfoSync().pixelRatio // 微信旧的canvas不能传入dpr
      const canvasDpr = 1;

      const query = wx.createSelectorQuery();
      query.select(`#${canvasId}`).boundingClientRect((res) => {
        if (!res) {
          setTimeout(() => this.init(), 50);
          return;
        }

        const { width, height } = res;

        if (typeof callback === 'function') {
          this.chart = callback(canvas, width, height, canvasDpr);
        } else if (typeof this.onInit === 'function') {
          this.chart = this.onInit(canvas, width, height, canvasDpr);
        } else {
          this.triggerEvent('init', {
            canvas,
            width,
            height,
            dpr: canvasDpr,
          });
        }
      }).exec();
    },
    canvasToTempFilePath(opt) {
      const { canvasId } = this;
      if (this.isUseNewCanvas) {
        // 新版
        const query = wx.createSelectorQuery();
        query
          .select(`#${canvasId}`)
          .fields({ node: true, size: true })
          .exec((res) => {
            const canvasNode = res[0].node;
            Object.assign(opt, { canvas: canvasNode });
            wx.canvasToTempFilePath(opt);
          });
      } else {
        // 旧的
        this.ctx.draw(true, () => {
          wx.canvasToTempFilePath({
            canvasId,
            ...opt,
          });
        });
      }
    },
    touchStart(e) {
      const { disableTouch, chart } = this;
      if (disableTouch || !chart || !e.mp.touches.length) return;

      const touch = e.mp.touches[0];
      const { handler } = chart.getZr();
      handler.dispatch('mousedown', {
        zrX: touch.x,
        zrY: touch.y,
      });
      handler.dispatch('mousemove', {
        zrX: touch.x,
        zrY: touch.y,
      });
      handler.proxy.processGesture(wrapTouch(e), 'start');
    },
    touchMove(e) {
      const {
        disableTouch, throttleTouch, chart, lastMoveTime,
      } = this;
      if (disableTouch || !chart || !e.mp.touches.length) return;

      if (throttleTouch) {
        const currMoveTime = Date.now();
        if (currMoveTime - lastMoveTime < 240) return;
        this.lastMoveTime = currMoveTime;
      }

      const touch = e.mp.touches[0];
      const { handler } = chart.getZr();
      handler.dispatch('mousemove', {
        zrX: touch.x,
        zrY: touch.y,
      });
      handler.proxy.processGesture(wrapTouch(e), 'change');
    },
    touchEnd(e) {
      const { disableTouch, chart } = this;
      if (disableTouch || !chart) return;
      const touch = e.mp.changedTouches ? e.mp.changedTouches[0] : {};
      const { handler } = chart.getZr();
      handler.dispatch('mouseup', {
        zrX: touch.x,
        zrY: touch.y,
      });
      handler.dispatch('click', {
        zrX: touch.x,
        zrY: touch.y,
      });
      handler.proxy.processGesture(wrapTouch(e), 'end');
    },
  },
};
</script>

<style scoped>
.ec-canvas {
  width: 100%;
  height: 100%;
}
</style>
