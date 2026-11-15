import { test, expect } from '@playwright/test'
import { setConfig } from './helpers'

// PNG 1x1 valide en base64
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const imageResponse = (imageTokens?: number) =>
  JSON.stringify({
    id: 'resp_img',
    output: [
      {
        type: 'image_generation_call',
        id: 'ig_1',
        status: 'completed',
        result: PNG_1X1,
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Image OK' }],
      },
    ],
    usage: { input_tokens: 20, output_tokens: 87 },
    ...(imageTokens !== undefined
      ? {
          tool_usage: {
            image_gen: { output_tokens_details: { image_tokens: imageTokens } },
          },
        }
      : {}),
  })

async function sendAndWait(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Message' }).fill('Dessine un chat')
  await page.getByRole('textbox', { name: 'Message' }).press('Enter')
  await page.waitForFunction(
    () => document.querySelector('main')?.textContent?.includes('Image OK'),
    { timeout: 10_000 },
  )
}

test.describe("TC-101 · Génération d'images (outil hébergé OpenAI)", () => {
  test("envoie l'outil avec le modèle choisi, affiche l'image et le coût estimé", async ({
    page,
  }) => {
    await setConfig(page, {
      streamEnabled: false,
      llm: { model: 'gpt-5.4' },
      hostedTools: {
        webSearch: false,
        imageGeneration: true,
        imageModel: 'gpt-image-2.6-flare',
      },
    })
    let sentBody: { tools?: unknown[] } = {}
    await page.route('**/v1/responses', async (route) => {
      sentBody = (await route.request().postDataJSON()) as {
        tools?: unknown[]
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: imageResponse(1000),
      })
    })

    await sendAndWait(page)

    expect(sentBody.tools).toEqual([
      {
        type: 'image_generation',
        model: 'gpt-image-2.6-flare',
        quality: 'low',
        size: '640x1024',
      },
    ])
    await expect(page.getByRole('img', { name: 'image générée' })).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    )
    await expect(page.getByText('Usage de la conversation')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText('Images générées')).toBeVisible()
    // 1000 tokens image × 30 $/M = 0,03 $
    await expect(page.getByText('$0.030000', { exact: true })).toBeVisible()
  })

  test('affiche « non estimé » sans champ image_tokens', async ({ page }) => {
    await setConfig(page, {
      streamEnabled: false,
      llm: { model: 'gpt-5.4' },
      hostedTools: {
        webSearch: false,
        imageGeneration: true,
        imageModel: 'gpt-image-2.6-flare',
      },
    })
    await page.route('**/v1/responses', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: imageResponse(),
      }),
    )

    await sendAndWait(page)

    await expect(page.getByRole('img', { name: 'image générée' })).toBeVisible()
    await expect(page.getByText('Images générées')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByText('non estimé', { exact: true })).toBeVisible()
  })
})
