<template>
  <div class="app-shell">
    <nav class="nav">
      <div class="brand">
        <img class="brand-mark" src="/favicon.png" alt="PiGrow" />
        <span class="brand-name">PiGrow</span>
        <span class="brand-divider">/</span>
        <span class="brand-suffix">Control Center</span>
      </div>
      <div class="nav-links">
        <router-link to="/" class="nav-link" active-class="active-link">Home</router-link>
        <router-link to="/admin" class="nav-link" active-class="active-link"
          >Administration</router-link
        >
      </div>
    </nav>
    <main class="content">
      <router-view />
    </main>
    <Toast position="bottom-right" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Toast from 'primevue/toast'
import { useDevicePresence } from './composables/useDevicePresence'

const presence = useDevicePresence()
onMounted(() => {
  presence.start()
})
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  background-image:
    radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.04) 0px, transparent 50%),
    radial-gradient(circle at 100% 100%, rgba(59, 130, 246, 0.03) 0px, transparent 50%);
  background-attachment: fixed;
}

.nav {
  background: rgba(21, 29, 46, 0.85);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 1px 0 0 rgba(34, 197, 94, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.2);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: var(--tracking-tight);
}

.brand-mark {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  display: block;
  flex-shrink: 0;
}

.brand-name {
  color: var(--color-text-primary);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.brand-divider {
  color: var(--color-bg-muted);
  font-weight: 300;
}

.brand-suffix {
  color: var(--color-text-secondary);
  font-weight: 500;
}

.nav-links {
  display: flex;
  gap: var(--space-1);
}

.nav-link {
  text-decoration: none;
  color: var(--color-text-secondary);
  font-weight: 500;
  font-size: var(--text-md);
  padding: 0.4375rem 0.875rem;
  border-radius: var(--radius-md);
  transition:
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
  cursor: pointer;
}

.nav-link:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.active-link {
  color: var(--color-accent);
  background: var(--color-accent-bg);
  box-shadow: inset 0 0 0 1px var(--color-accent-border);
}

.content {
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--space-8);
  animation: fade-in var(--duration-slow) var(--ease-out);
}
</style>
