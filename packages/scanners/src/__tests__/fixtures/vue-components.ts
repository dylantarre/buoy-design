export const SIMPLE_BUTTON_VUE = `
<template>
  <button @click="handleClick">{{ label }}</button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();

const emit = defineEmits(['click']);
const handleClick = () => emit('click');
</script>

<style scoped>
button { color: #0066cc; }
</style>
`;

export const CARD_WITH_PROPS_VUE = `
<template>
  <div class="card">
    <h2>{{ title }}</h2>
    <p>{{ subtitle }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>
`;

export const BADGE_WITH_STYLES_VUE = `
<template>
  <span class="badge">{{ text }}</span>
</template>

<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<style scoped>
.badge {
  background-color: #ff0000;
  padding: 8px;
  border-radius: 4px;
}
</style>
`;

export const DEPRECATED_COMPONENT_VUE = `
<template>
  <button>Old Button</button>
</template>

<script setup lang="ts">
/**
 * @deprecated Use NewButton instead
 */
defineProps<{
  label: string;
}>();
</script>
`;

export const OPTIONS_API_COMPONENT_VUE = `
<template>
  <div>{{ message }}</div>
</template>

<script>
export default {
  name: 'MessageDisplay',
  props: {
    message: {
      type: String,
      required: true
    },
    count: Number
  }
}
</script>
`;

export const COMPONENT_WITH_DEPENDENCIES_VUE = `
<template>
  <div>
    <HeaderBar />
    <sidebar-menu />
    <FooterBar />
  </div>
</template>

<script setup lang="ts">
import HeaderBar from './HeaderBar.vue';
import FooterBar from './FooterBar.vue';
</script>
`;
