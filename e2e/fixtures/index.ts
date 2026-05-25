import { test as base } from '@playwright/test'
import { resetDbForWorker, createTestAdmin } from './db'
import { clearTokenCache, loginAs } from '../helpers/auth'
import { createSession } from '../helpers/session'

type WorkerAdmin = { id: number; token: string; workerIndex: number }

export type Fixtures = {
  adminToken: string
  sessionCode: string
}

type WorkerFixtures = {
  _workerAdmin: WorkerAdmin
}

export const test = base.extend<Fixtures & { _reset: void }, WorkerFixtures>({
  _workerAdmin: [async ({}, use, workerInfo) => {
    const idx = workerInfo.workerIndex
    const username = `admin_w${idx}`
    // Upsert so any worker index works, even beyond the pre-created range
    const { id: adminId } = await createTestAdmin(username, 'testpw')
    const token = await loginAs(username, 'testpw')
    await use({ id: adminId, token, workerIndex: idx })
  }, { scope: 'worker' }],

  _reset: [async ({ _workerAdmin }, use) => {
    clearTokenCache()
    await resetDbForWorker(_workerAdmin.workerIndex, _workerAdmin.id)
    await use()
  }, { auto: true }],

  adminToken: async ({ _workerAdmin }, use) => {
    await use(_workerAdmin.token)
  },

  sessionCode: async ({ adminToken }, use) => {
    const code = await createSession(adminToken)
    await use(code)
  },
})

export { expect } from '@playwright/test'
