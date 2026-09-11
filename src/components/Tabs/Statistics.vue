<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const helper = useHelper()

const { todayData, statisticsData } = helper.statistics

// const { next, page } = usePager()
const conf = useConf()
const statisticCycle = ref(1)

const statisticCycleData = [
  {
    label: '近三日筛选通过',
    help: '近三天筛选通过的岗位数量',
    date: 3,
  },
  {
    label: '本周筛选通过',
    help: '近一周筛选通过的岗位数量',
    date: 7,
  },
  {
    label: '本月筛选通过',
    help: '近一个月筛选通过的岗位数量',
    date: 30,
  },
  {
    label: '历史筛选通过',
    help: '历史筛选通过的岗位数量',
    date: -1,
  },
]

const cycle = computed(() => {
  const date = statisticCycleData[statisticCycle.value]?.date
  let ans = 0
  if (!date) return ans
  for (
    let i = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    (date === -1 || i < date - 1) && i < statisticsData.value.length;
    i++
  ) {
    ans += statisticsData.value[i]?.success ?? 0
  }
  return ans
})

onMounted(() => {
  void helper.statistics.updateStatistics()
})
</script>

<template>
  <div class="flex gap-2 flex-col">
    <Alert
      id="config-statistics"
      description="数据用于记录岗位筛选结果，点击开始只会筛选当前页面岗位，不会投递简历。"
      color="warning"
      show-icon
    />
    <div v-if="conf.configLevel.intermediate" class="grid grid-cols-5 gap-4">
      <div data-help="统计当天脚本扫描过的所有岗位">
        <div class="text-sm text-gray-500">岗位总数：</div>
        <div class="text-2xl font-semibold">
          {{ todayData.total }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天岗位过滤的比例,被过滤/总数">
        <div class="text-sm text-gray-500">过滤比例：</div>
        <div class="text-2xl font-semibold">
          {{ (((todayData.total - todayData.success) / todayData.total) * 100).toFixed(0) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天刷到了多少处理过的岗位,重复/总数">
        <div class="text-sm text-gray-500">重复比例：</div>
        <div class="text-2xl font-semibold">
          {{ ((todayData.repeat / todayData.total) * 100).toFixed(0) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天岗位中的活跃情况,不活跃/总数">
        <div class="text-sm text-gray-500">活跃比例：</div>
        <div class="text-2xl font-semibold">
          {{ ((todayData.activityFilter / todayData.total) * 100).toFixed(0) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div :data-help="statisticCycleData[statisticCycle]?.help">
        <UDropdownMenu
          :items="
            statisticCycleData.map((item, index) => ({
              label: item.label,
              onSelect: () => (statisticCycle = index),
            }))
          "
        >
          <div class="text-sm text-gray-500 cursor-pointer flex items-center gap-1">
            {{ statisticCycleData[statisticCycle]?.label }}:
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 1024 1024">
              <path
                fill="currentColor"
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
              />
            </svg>
          </div>
        </UDropdownMenu>
        <div class="text-2xl font-semibold">
          {{ cycle + todayData.success }}
          <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
    </div>
    <div class="flex flex-row gap-2 items-center justify-center">
      <UFieldGroup>
        <UButton
          color="primary"
          data-help="点击开始会筛选当前页面岗位，不会投递简历"
          :loading="helper.workflow?.status.value === 'running'"
          @click="helper.start()"
        >
          {{ helper.workflow?.status.value === 'stop' ? '继续筛选' : '开始筛选' }}
        </UButton>
        <UButton
          v-if="helper.workflow?.status.value === 'stop'"
          color="warning"
          data-help="重置筛选结果，开始后将重新处理未通过的岗位"
          @click="helper.reset()"
        >
          重置筛选
        </UButton>
        <UButton
          v-if="helper.workflow?.status.value === 'running'"
          color="warning"
          data-help="暂停后应该能继续"
          @click="helper.stop()"
        >
          暂停
        </UButton>
      </UFieldGroup>
      <UProgress
        data-help="显示当前页面岗位的筛选进度"
        class="flex-1"
        :model-value="
          helper.workflow?.total.value
            ? (helper.workflow.current.value / helper.workflow.total.value) * 100
            : 0
        "
      />
    </div>
  </div>
</template>

<style lang="scss"></style>
