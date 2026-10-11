import path from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const BACKEND = 'http://localhost:8100'

const fixture = (name: string) => path.resolve(import.meta.dirname, '../fixtures', name)

export const SONGS = {
  alpha: { file: fixture('alpha.mp3'), title: 'Alpha Tune' },
  bravo: { file: fixture('bravo.mp3'), title: 'Bravo Tune' },
  charlie: { file: fixture('charlie.mp3'), title: 'Charlie Tune' },
} as const

export async function resetBackend(request: APIRequestContext) {
  const response = await request.post(`${BACKEND}/api/v1/test/reset`)
  expect(response.status()).toBe(204)
}

export async function uploadSongs(page: Page, ...songs: (keyof typeof SONGS)[]) {
  await page.goto('/library')
  await page.getByTestId('file-input').setInputFiles(songs.map((s) => SONGS[s].file))
  for (const song of songs) {
    await expect(page.getByRole('row', { name: new RegExp(SONGS[song].title) })).toBeVisible()
  }
}

export const player = (page: Page) => page.getByRole('region', { name: 'Player' })

export const elapsed = (page: Page) => page.getByTestId('elapsed')

export async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name, exact: true }).fill(String(value))
}

/** The elapsed time as seconds. */
export async function elapsedSeconds(page: Page): Promise<number> {
  const text = (await elapsed(page).textContent()) ?? '0:00'
  const [m, s] = text.split(':').map(Number)
  return (m ?? 0) * 60 + (s ?? 0)
}

export async function createPlaylist(page: Page, name: string) {
  await page.goto('/playlists')
  await page.getByRole('button', { name: 'New playlist' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('list', { name: 'Playlists' }).getByText(name)).toBeVisible()
}

export async function addToPlaylist(page: Page, songTitle: string, playlistName: string) {
  await page.getByRole('button', { name: `Actions for ${songTitle}` }).click()
  await page.getByRole('menuitem', { name: 'Add to playlist' }).click()
  await page.getByRole('menuitem', { name: playlistName }).click()
  await expect(page.getByText(`Added to “${playlistName}”`).last()).toBeVisible()
}
