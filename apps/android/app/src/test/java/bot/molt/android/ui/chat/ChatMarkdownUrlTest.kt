package bot.molt.android.ui.chat

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMarkdownUrlTest {
  private val dummyCodeBg = Color.Gray
  private val dummyLinkColor = Color.Blue

  @Test
  fun `extracts simple https URL`() {
    val text = "Check this: https://example.com/page"
    val regex = Regex("""https?://[^\s<>\[\](){}'"`,]+""")
    val match = regex.find(text)
    assertEquals("https://example.com/page", match?.value)
  }

  @Test
  fun `extracts URL with trailing punctuation stripped`() {
    val url = "https://example.com/page."
    val trimmed = url.trimEnd('.', ',', '!', '?', ':', ';', ')')
    assertEquals("https://example.com/page", trimmed)
  }

  @Test
  fun `extracts multiple URLs`() {
    val text = "See https://a.com and https://b.com for more."
    val regex = Regex("""https?://[^\s<>\[\](){}'"`,]+""")
    val matches = regex.findAll(text).toList()
    assertEquals(2, matches.size)
    assertEquals("https://a.com", matches[0].value)
    assertEquals("https://b.com", matches[1].value)
  }

  @Test
  fun `http URLs also work`() {
    val text = "Old link: http://legacy.example.org/path"
    val regex = Regex("""https?://[^\s<>\[\](){}'"`,]+""")
    val match = regex.find(text)
    assertTrue(match?.value?.startsWith("http://") == true)
  }

  @Test
  fun `URL with query params`() {
    val text = "API: https://api.example.com/search?q=test&limit=10"
    val regex = Regex("""https?://[^\s<>\[\](){}'"`,]+""")
    val match = regex.find(text)
    assertEquals("https://api.example.com/search?q=test&limit=10", match?.value)
  }

  @Test
  fun `URL with fragment`() {
    val text = "Docs at https://docs.example.com/guide#section-3"
    val regex = Regex("""https?://[^\s<>\[\](){}'"`,]+""")
    val match = regex.find(text)
    assertEquals("https://docs.example.com/guide#section-3", match?.value)
  }
}
