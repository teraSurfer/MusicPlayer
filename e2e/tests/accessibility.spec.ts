import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addToPlaylist, createPlaylist, resetBackend, uploadSongs } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetBackend(request)
})

async function expectNoSeriousViolations(page: Page) {
  // Toasts fade in and out; scanning mid-animation reports blended colours that are not real.
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 })
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `  ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1] ?? ''}`).join('\n'),
    ),
    'serious accessibility violations',
  ).toEqual([])
}

test('N-01 library, pool, playlists and player have no serious axe violations', async ({ page }) => {
  await uploadSongs(page, 'alpha', 'bravo')
  await createPlaylist(page, 'Mix')
  await page.getByRole('link', { name: 'Library' }).click()
  await addToPlaylist(page, 'Alpha Tune', 'Mix')
  await page.getByRole('button', { name: 'Play Alpha Tune' }).click()

  await expectNoSeriousViolations(page) // library with a track playing

  await page.getByRole('link', { name: 'Pool' }).click()
  await expect(page.getByRole('row', { name: /Bravo Tune/ })).toBeVisible()
  await expectNoSeriousViolations(page)

  await page.getByRole('link', { name: 'Playlists' }).click()
  await expect(page.getByRole('list', { name: 'Playlists' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await page.getByRole('link', { name: /Mix/ }).click()
  await expect(page.getByRole('row', { name: /Alpha Tune/ })).toBeVisible()
  await expectNoSeriousViolations(page)
})
