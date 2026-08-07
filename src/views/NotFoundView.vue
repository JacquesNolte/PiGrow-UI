<script setup lang="ts">
import { useRouter } from 'vue-router'
import Card from 'primevue/card'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <div class="not-found">
    <Card class="not-found-card">
      <template #content>
        <div class="not-found-content">
          <div class="not-found-logo-frame">
            <img class="not-found-logo" src="/logo.png" alt="PiGrow" />
          </div>
          <h1 class="not-found-title">Route not found</h1>
          <p class="not-found-sub">
            The page you tried to open doesn't exist (or no longer exists). Check the URL, or jump
            back to a known location.
          </p>
          <div class="not-found-actions">
            <Button
              label="Back to dashboard"
              icon="pi pi-home"
              severity="success"
              @click="router.push('/')"
            />
            <Button
              label="Administration"
              icon="pi pi-cog"
              severity="secondary"
              @click="router.push('/admin')"
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.not-found {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: var(--space-12);
}

.not-found-card {
  max-width: 480px;
  width: 100%;
}

.not-found-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.not-found-logo-frame {
  width: 96px;
  height: 96px;
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: var(--space-2);
}

.not-found-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.not-found-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.not-found-sub {
  color: var(--color-text-secondary);
  margin: 0;
  max-width: 36ch;
}

.not-found-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
