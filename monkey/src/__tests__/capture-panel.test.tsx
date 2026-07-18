import { describe, test, expect, vi, afterEach } from 'bun:test'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/preact'
import { CapturePanel } from '../ui/components/CapturePanel'

describe('CapturePanel', () => {
  afterEach(cleanup)

  test('renders the textarea, save button, and cancel button', () => {
    const { getByPlaceholderText, getByText } = render(<CapturePanel onClose={() => {}} />)
    expect(getByPlaceholderText(/写下你此刻真实的理解/)).toBeTruthy()
    expect(getByText('拾取')).toBeTruthy()
    expect(getByText('取消')).toBeTruthy()
  })

  test('save button is disabled when the thought is empty', () => {
    const { getByText } = render(<CapturePanel onClose={() => {}} />)
    const saveBtn = getByText('拾取') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  test('typing enables the save button and clicking save calls onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const { getByPlaceholderText, getByText } = render(
      <CapturePanel onSave={onSave} onClose={onClose} />,
    )
    const textarea = getByPlaceholderText(/写下你此刻真实的理解/)
    fireEvent.input(textarea, { target: { value: 'My new insight.' } })

    const saveBtn = getByText('拾取') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
    fireEvent.click(saveBtn)

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('My new insight.', undefined))
    // onSave resolves → onClose is called
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  test('cancel button calls onClose immediately', () => {
    const onClose = vi.fn()
    const { getByText } = render(<CapturePanel onClose={onClose} />)
    fireEvent.click(getByText('取消'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('shows the excerpt section when an excerpt is provided', () => {
    const { getByText } = render(
      <CapturePanel excerptText="A notable passage." onClose={() => {}} />,
    )
    expect(getByText('来源引用')).toBeTruthy()
    expect(getByText(/A notable passage/)).toBeTruthy()
  })

  test('switches to Preview tab and renders markdown', () => {
    const { getByText, getByPlaceholderText } = render(
      <CapturePanel initialThought="**bold idea**" onClose={() => {}} />,
    )
    // Switch to preview
    fireEvent.click(getByText('Preview'))
    // marked renders **bold idea** as <strong>bold idea</strong>
    expect(getByText('bold idea')).toBeTruthy()
    // Textarea should be gone in preview mode
    expect(() => getByPlaceholderText(/写下你此刻真实的理解/)).toThrow()
  })

  test('preview tab shows empty hint when thought is blank', () => {
    const { getByText } = render(<CapturePanel onClose={() => {}} />)
    fireEvent.click(getByText('Preview'))
    expect(getByText('暂无内容可预览')).toBeTruthy()
  })

  test('Cmd+Enter triggers save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const { getByPlaceholderText } = render(<CapturePanel onSave={onSave} onClose={onClose} />)
    const textarea = getByPlaceholderText(/写下你此刻真实的理解/)
    fireEvent.input(textarea, { target: { value: 'Quick capture.' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Quick capture.', undefined))
  })

  test('shows error message when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Storage full'))
    const { getByPlaceholderText, getByText } = render(
      <CapturePanel onSave={onSave} onClose={() => {}} />,
    )
    fireEvent.input(getByPlaceholderText(/写下你此刻真实的理解/), {
      target: { value: 'Failing save.' },
    })
    fireEvent.click(getByText('拾取'))

    await waitFor(() => expect(getByText('Storage full')).toBeTruthy())
  })
})
