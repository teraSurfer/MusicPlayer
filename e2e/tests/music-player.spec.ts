import { expect, test } from '@playwright/test'
import {
  addToPlaylist,
  createPlaylist,
  elapsed,
  elapsedSeconds,
  player,
  resetBackend,
  setRange,
  SONGS,
  uploadSongs,
} from './helpers'

test.beforeEach(async ({ request }) => {
  await resetBackend(request)
})

test.describe('UC1 add songs', () => {
  test('E-01 uploading two files shows both with correct title and duration', async ({ page }) => {
    await uploadSongs(page, 'alpha', 'bravo')

    const row = page.getByRole('row', { name: /Alpha Tune/ })
    await expect(row).toContainText('E2E Artist')
    await expect(row).toContainText('E2E Album')
    await expect(row).toContainText('0:20')
    await expect(page.getByText('2 songs', { exact: true })).toBeVisible()
  })

  test('E-02 uploading the same file again does not duplicate it', async ({ page }) => {
    await uploadSongs(page, 'alpha')

    await page.getByTestId('file-input').setInputFiles(SONGS.alpha.file)

    await expect(page.getByText(/already exists/).first()).toBeVisible()
    await expect(page.getByRole('row', { name: /Alpha Tune/ })).toHaveCount(1)
    await expect(page.getByText('1 song', { exact: true })).toBeVisible()
  })

  test('E-03 a removed song stays in the pool and can be added back', async ({ page }) => {
    await uploadSongs(page, 'alpha')

    await page.getByRole('button', { name: 'Actions for Alpha Tune' }).click()
    await page.getByRole('menuitem', { name: 'Remove from collection' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Your library is empty')).toBeVisible()

    await page.getByRole('link', { name: 'Pool' }).click()
    await expect(page.getByRole('row', { name: /Alpha Tune/ })).toBeVisible()
    await page.getByRole('button', { name: 'Add Alpha Tune to collection' }).click()
    await expect(page.getByText('In collection')).toBeVisible()

    await page.getByRole('link', { name: 'Library' }).click()
    await expect(page.getByRole('row', { name: /Alpha Tune/ })).toBeVisible()
  })
})

test.describe('UC2 playback', () => {
  test.beforeEach(async ({ page }) => {
    await uploadSongs(page, 'alpha', 'bravo', 'charlie')
  })

  test('E-04 plays, pauses, seeks and changes volume', async ({ page }) => {
    await page.getByRole('button', { name: 'Play Alpha Tune' }).click()
    await expect(page.getByTestId('player-title')).toHaveText('Alpha Tune')

    // time advances
    await expect.poll(() => elapsedSeconds(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)

    // pause stops it
    await player(page).getByRole('button', { name: 'Pause', exact: true }).click()
    const frozen = await elapsedSeconds(page)
    await page.waitForTimeout(1500)
    expect(await elapsedSeconds(page)).toBe(frozen)

    // seek jumps
    await setRange(page, 'Seek', 12)
    await expect(elapsed(page)).toHaveText('0:12')

    // volume is applied and remembered
    await setRange(page, 'Volume', 0.3)
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('musicplayer.player.settings.v1') ?? '{}'),
    )
    expect(saved.volume).toBeCloseTo(0.3)
  })

  test('E-05 repeat-one restarts a finished song; repeat-off stops', async ({ page }) => {
    await page.getByRole('button', { name: 'Play Alpha Tune' }).click()
    await expect(page.getByTestId('player-title')).toHaveText('Alpha Tune')
    await player(page).getByRole('button', { name: /^Repeat/ }).click() // all
    await player(page).getByRole('button', { name: /^Repeat/ }).click() // one
    await expect(player(page).getByRole('button', { name: 'Repeat: one' })).toBeVisible()

    await setRange(page, 'Seek', 19)

    await expect.poll(() => elapsedSeconds(page), { timeout: 10_000 }).toBeLessThan(10)
    await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(page.getByTestId('player-title')).toHaveText('Alpha Tune')

    // repeat off, on the last track of the queue (the library lists newest first): stops
    await player(page).getByRole('button', { name: /^Repeat/ }).click() // off
    await expect(player(page).getByRole('button', { name: 'Repeat: off' })).toBeVisible()
    await setRange(page, 'Seek', 19)
    await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('E-09 volume, repeat and shuffle survive a reload', async ({ page }) => {
    await setRange(page, 'Volume', 0.25)
    await player(page).getByRole('button', { name: /^Repeat/ }).click()
    await player(page).getByRole('button', { name: 'Shuffle' }).click()

    await page.reload()

    await expect(page.getByRole('slider', { name: 'Volume' })).toHaveValue('0.25')
    await expect(player(page).getByRole('button', { name: 'Repeat: all' })).toBeVisible()
    await expect(player(page).getByRole('button', { name: 'Shuffle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('keyboard shortcuts control playback', async ({ page }) => {
    // The library lists newest first, so Charlie is first in the queue and Bravo follows.
    await page.getByRole('button', { name: 'Play Charlie Tune' }).click()
    await expect(player(page).getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

    await page.locator('main').click({ position: { x: 600, y: 5 } })
    await page.keyboard.press('Space')
    await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible()

    await page.keyboard.press('Shift+ArrowRight')
    await expect(page.getByTestId('player-title')).toHaveText('Bravo Tune')

    await page.keyboard.press('m')
    await expect(player(page).getByRole('button', { name: 'Unmute' })).toBeVisible()
  })
})

async function openMixWithThreeSongs(page: import('@playwright/test').Page) {
  await uploadSongs(page, 'alpha', 'bravo', 'charlie')
  await createPlaylist(page, 'Mix')
  await page.getByRole('link', { name: 'Library' }).click()
  for (const title of ['Alpha Tune', 'Bravo Tune', 'Charlie Tune']) {
    await addToPlaylist(page, title, 'Mix')
    await expect(page.getByRole('menu')).toHaveCount(0)
  }
  await page.getByRole('link', { name: 'Playlists' }).click()
  await page.getByRole('link', { name: /Mix/ }).click()
}

const playlistTitles = (page: import('@playwright/test').Page) =>
  page.getByRole('row').filter({ hasText: 'Tune' }).locator('td:nth-child(3)').allTextContents()

test.describe('UC3-UC5 playlists', () => {
  test('E-06 create, reject a duplicate name, delete', async ({ page }) => {
    await createPlaylist(page, 'Road Trip')

    await page.getByRole('button', { name: 'New playlist' }).click()
    await page.getByLabel('Name').fill('road trip')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already exists')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Delete Road Trip' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No playlists yet')).toBeVisible()
  })

  test('E-07 add, reorder and remove songs; the result survives a reload', async ({ page }) => {
    await openMixWithThreeSongs(page)
    await expect
      .poll(() => playlistTitles(page))
      .toEqual(['Alpha Tune', 'Bravo Tune', 'Charlie Tune'])

    await page.getByRole('button', { name: 'Move Charlie Tune up' }).click()
    await expect
      .poll(() => playlistTitles(page))
      .toEqual(['Alpha Tune', 'Charlie Tune', 'Bravo Tune'])

    await page.getByRole('button', { name: 'Remove Alpha Tune from playlist' }).click()
    await expect.poll(() => playlistTitles(page)).toEqual(['Charlie Tune', 'Bravo Tune'])

    await page.reload()
    await expect.poll(() => playlistTitles(page)).toEqual(['Charlie Tune', 'Bravo Tune'])

    // removing from a playlist does not touch the collection
    await page.getByRole('link', { name: 'Library' }).click()
    await expect(page.getByRole('row', { name: /Alpha Tune/ })).toBeVisible()
  })

  test('E-10 drag and drop reorders a playlist', async ({ page }) => {
    await openMixWithThreeSongs(page)
    await expect
      .poll(() => playlistTitles(page))
      .toEqual(['Alpha Tune', 'Bravo Tune', 'Charlie Tune'])

    const handle = page.getByRole('button', { name: 'Drag to reorder Charlie Tune' })
    const target = page.getByRole('row', { name: /Alpha Tune/ })
    const from = (await handle.boundingBox())!
    const to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + 5, from.y - 10, { steps: 5 })
    await page.mouse.move(from.x + 5, to.y + 2, { steps: 15 })
    await page.mouse.up()

    await expect
      .poll(() => playlistTitles(page))
      .toEqual(['Charlie Tune', 'Alpha Tune', 'Bravo Tune'])
  })

  test('E-08 plays a playlist in order with next, previous and repeat-all', async ({ page }) => {
    await openMixWithThreeSongs(page)

    await page.getByRole('button', { name: 'Play playlist' }).click()
    const title = page.getByTestId('player-title')
    await expect(title).toHaveText('Alpha Tune')
    await expect(page.getByRole('row', { name: /Alpha Tune/ })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await player(page).getByRole('button', { name: 'Next' }).click()
    await expect(title).toHaveText('Bravo Tune')
    await player(page).getByRole('button', { name: 'Previous' }).click()
    await expect(title).toHaveText('Alpha Tune')

    await player(page).getByRole('button', { name: /^Repeat/ }).click() // all
    await player(page).getByRole('button', { name: 'Next' }).click()
    await player(page).getByRole('button', { name: 'Next' }).click()
    await expect(title).toHaveText('Charlie Tune')
    await player(page).getByRole('button', { name: 'Next' }).click()
    await expect(title).toHaveText('Alpha Tune') // wrapped
  })
})
