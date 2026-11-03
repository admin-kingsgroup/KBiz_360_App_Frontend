package com.kingsgroup.kbiz360.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class WidgetDataTest {
  private val ist: TimeZone = TimeZone.getTimeZone("Asia/Kolkata")

  /** 2026-10-29 at [hour]:[minute] in Mumbai. */
  private fun at(hour: Int, minute: Int = 0, dayOffset: Int = 0): Long = Calendar.getInstance(ist).apply {
    clear()
    set(2026, Calendar.OCTOBER, 29, hour, minute)
    add(Calendar.DAY_OF_YEAR, dayOffset)
  }.timeInMillis

  private val fmt = object : Formats {
    override fun time(ms: Long) = "T@$ms"
    override fun weekday(ms: Long) = "WD"
    override fun dayMonth(ms: Long) = "DM"
  }

  private fun reminder(id: String, dueAt: Long?, by: String = "", whenLabel: String = "") = ReminderItem(id, "Do $id", whenLabel, dueAt, by)

  private fun snapshot(
    reminders: List<ReminderItem> = emptyList(),
    forMe: Int? = null,
    count: Int = 0,
    inAt: Long? = null,
    outAt: Long? = null,
    review: Int? = null,
    reviewItems: List<ReviewItem> = emptyList(),
    unreadChats: Int = 0,
    unreadGroups: Int = 0,
  ) = Snapshot(
    signedIn = true, userName = "Anubhav Maurya", unreadChats = unreadChats, unreadMessages = 0, chats = emptyList(),
    reminderCount = count, reminderForMe = forMe, reminderReview = 0, reminders = reminders, approvals = 0,
    attendanceInAt = inAt, attendanceOutAt = outAt, updatedAt = null, review = review, reviewItems = reviewItems,
    unreadGroups = unreadGroups,
  )

  @Test
  fun `reads a full snapshot written by the app`() {
    val s = parseSnapshot(
      """{"signedIn":true,"userName":"Anubhav Maurya","unreadChats":2,"unreadMessages":5,
        "chats":[{"id":"c1","name":"MHUB - Branch Accounts","preview":"BSP uploaded","unread":4,"at":1761717600000,"group":true}],
        "reminderCount":8,"reminderForMe":7,
        "reminders":[{"id":"r1","text":"Send snapshot","when":"Today","dueAt":1761720000000,"by":"Farhan"}],
        "approvals":5,"attendanceIn":"9:12 AM","attendanceOut":null,
        "attendanceInAt":1761709320000,"attendanceOutAt":null,"updatedAt":1761717600000}""",
    )!!
    assertTrue(s.signedIn)
    assertEquals(7, s.reminderForMe)
    assertEquals(5, s.approvals)
    assertEquals(1761709320000L, s.attendanceInAt)
    assertNull(s.attendanceOutAt)
    assertEquals(ReminderItem("r1", "Send snapshot", "Today", 1761720000000L, "Farhan"), s.reminders.single())
    assertEquals(ChatItem("c1", "MHUB - Branch Accounts", "BSP uploaded", 4, 1761717600000L, true), s.chats.single())
  }

  @Test
  fun `reads an old snapshot without the newer fields, and rejects junk`() {
    val s = parseSnapshot("""{"signedIn":true,"userName":"A","unreadChats":1,"reminderCount":3,"reminders":[{"id":"r","text":"x","when":"Today"}]}""")!!
    assertEquals(3, s.reminderCount)
    assertNull(s.reminderForMe)
    assertEquals(0, s.approvals)
    assertNull(s.reminders.single().dueAt)
    assertEquals(3, Work(s, at(10), ist).todo)
    assertEquals(0, s.unreadGroups)
    // no review fields: not the Owner, the board stays as it was
    assertNull(s.review)
    assertTrue(s.reviewItems.isEmpty())
    assertFalse(Work(s, at(10), ist).isOwner)
    assertFalse(parseSnapshot("""{"signedIn":false}""")!!.signedIn)
    assertNull(parseSnapshot("not json"))
    assertNull(parseSnapshot(null))
  }

  @Test
  fun `orders reminders soonest first, undated last, and counts the late ones`() {
    val now = at(14)
    val w = Work(
      snapshot(
        reminders = listOf(reminder("undated", null), reminder("tomorrow", at(10, dayOffset = 1)), reminder("late", at(9)), reminder("today", at(16))),
        forMe = 7,
      ),
      now, ist,
    )
    assertEquals(listOf("late", "today", "tomorrow", "undated"), w.items.map { it.id })
    assertEquals(1, w.late)
    assertEquals(7, w.todo)
    assertEquals("Good afternoon, Anubhav", w.greetingLine)
  }

  @Test
  fun `due labels read like the iOS widget`() {
    val now = at(14)
    assertEquals(DueLabel("5h late", Tone.DANGER), dueLabel(reminder("a", at(9)), now, ist, fmt))
    assertEquals(DueLabel("1m late", Tone.DANGER), dueLabel(reminder("a", now - 10_000), now, ist, fmt))
    assertEquals(DueLabel("2d late", Tone.DANGER), dueLabel(reminder("a", at(13, dayOffset = -2)), now, ist, fmt))
    assertEquals(DueLabel("T@${at(16)}", Tone.WARN), dueLabel(reminder("a", at(16)), now, ist, fmt))
    assertEquals(DueLabel("Tomorrow", Tone.PRIMARY), dueLabel(reminder("a", at(1, dayOffset = 1)), now, ist, fmt))
    assertEquals(DueLabel("WD", Tone.PRIMARY), dueLabel(reminder("a", at(9, dayOffset = 3)), now, ist, fmt))
    assertEquals(DueLabel("DM", Tone.PRIMARY), dueLabel(reminder("a", at(9, dayOffset = 9)), now, ist, fmt))
    assertEquals(DueLabel("Every Monday", Tone.NEUTRAL), dueLabel(reminder("a", null, whenLabel = "Every Monday"), now, ist, fmt))
    assertEquals(DueLabel("No date", Tone.NEUTRAL), dueLabel(reminder("a", null), now, ist, fmt))
  }

  @Test
  fun `a punch from an earlier day is not today's`() {
    val now = at(14)
    assertEquals(Punch.OnDuty(at(9, 12)), Work(snapshot(inAt = at(9, 12)), now, ist).punch)
    assertEquals(Punch.Done(at(9, 12), at(13)), Work(snapshot(inAt = at(9, 12), outAt = at(13)), now, ist).punch)
    assertEquals(Punch.NotIn, Work(snapshot(inAt = at(9, dayOffset = -1)), now, ist).punch)
    assertEquals(Punch.NotIn, Work(snapshot(), now, ist).punch)
  }

  @Test
  fun `words for time and names`() {
    assertEquals("8h 52m", duration(532 * 60_000L))
    assertEquals("45m", duration(45 * 60_000L))
    assertEquals("now", ago(at(14), at(14), fmt))
    assertEquals("6m", ago(at(13, 54), at(14), fmt))
    assertEquals("3h", ago(at(11), at(14), fmt))
    assertEquals("DM", ago(at(11, dayOffset = -2), at(14), fmt))
    assertEquals("MB", initials("MHUB - Branch Accounts"))
    assertEquals("FA", initials("Farhan Aga"))
    assertEquals("?", initials(""))
  }

  @Test
  fun `redraws at the next due time, the greeting changes and midnight`() {
    val s = snapshot(reminders = listOf(reminder("soon", at(10, 10)), reminder("past", at(8))))
    assertEquals(at(10, 10), nextRedraw(at(10), s, ist))
    assertEquals(at(10, 30), nextRedraw(at(10), snapshot(), ist))
    assertEquals(at(12), nextRedraw(at(11, 50), snapshot(), ist))
    assertEquals(at(17), nextRedraw(at(16, 45), snapshot(), ist))
    assertEquals(at(0, dayOffset = 1), nextRedraw(at(23, 40), snapshot(), ist))
    // never sooner than a minute away
    assertEquals(at(10) + 60_000, nextRedraw(at(10), snapshot(reminders = listOf(reminder("now", at(10) + 5_000))), ist))
  }

  @Test
  fun `large board fits as many rows as its height allows`() {
    // the iOS large board: 3 reminders + 2 chats, or 4 reminders when nothing is unread
    assertEquals(LargePlan(3, 2, true), largePlan(400f, 1f, reminders = 7, chats = 3))
    assertEquals(LargePlan(4, 0, true), largePlan(380f, 1f, reminders = 7, chats = 0))
    // taller: spare room takes more reminders, then more chats, up to the caps
    assertEquals(LargePlan(4, 2, true), largePlan(432f, 1f, reminders = 7, chats = 3))
    assertEquals(LargePlan(MAX_REMINDER_ROWS, 3, true), largePlan(700f, 1f, reminders = 9, chats = 3))
    assertEquals(LargePlan(2, 1, true), largePlan(700f, 1f, reminders = 2, chats = 1))
    val short = largePlan(280f, 1f, reminders = 7, chats = 3)
    assertTrue(short.reminderRows in 1..3)
    assertFalse(short.showChats)
    // bigger text, fewer rows
    assertTrue(largePlan(420f, 1.3f, 7, 3).reminderRows + largePlan(420f, 1.3f, 7, 3).chatRows < 5)
  }

  @Test
  fun `reads the Owner's review, and only the Owner's snapshot has one`() {
    val s = parseSnapshot(
      """{"signedIn":true,"userName":"Afshin","reminderCount":2,"approvals":3,"review":5,
        "reviewItems":[
          {"id":"k1","title":"Payment · Dream Holidays · advance","branch":"HFBM","amount":"${'$'}5,000","at":1761717600000},
          {"id":"k2","title":"Credit grace · Rahul Shah","branch":"","amount":"₹1,20,000","at":null},
          {"id":"k3","title":"","branch":"BOM"}
        ]}""",
    )!!
    assertEquals(5, s.review)
    assertEquals(ReviewItem("k1", "Payment · Dream Holidays · advance", "HFBM", "${'$'}5,000", 1761717600000L), s.reviewItems[0])
    assertEquals(ReviewItem("k2", "Credit grace · Rahul Shah", "", "₹1,20,000", null), s.reviewItems[1])
    assertEquals(ReviewItem("k3", "", "BOM", "", null), s.reviewItems[2])
    val w = Work(s, at(10), ist)
    assertTrue(w.isOwner)
    assertEquals(5, w.review)

    // the Owner with nothing new is still the Owner; a null review is not
    assertTrue(Work(parseSnapshot("""{"signedIn":true,"review":0}""")!!, at(10), ist).isOwner)
    assertFalse(Work(parseSnapshot("""{"signedIn":true,"review":null,"reviewItems":[]}""")!!, at(10), ist).isOwner)
    assertEquals(0, Work(snapshot(), at(10), ist).review)
  }

  @Test
  fun `reads how many unread chats are groups, and the Owner's tile notes`() {
    assertEquals(3, parseSnapshot("""{"signedIn":true,"unreadChats":8,"unreadGroups":3,"review":0}""")!!.unreadGroups)
    assertEquals(0, parseSnapshot("""{"signedIn":true,"unreadGroups":null}""")!!.unreadGroups)

    val now = at(14)
    val lateTwo = listOf(reminder("a", at(9)), reminder("b", at(13)), reminder("c", at(16)))
    assertEquals("2 late", Work(snapshot(reminders = lateTwo, review = 0), now, ist).lateNote)
    assertNull(Work(snapshot(reminders = listOf(reminder("c", at(16))), review = 0), now, ist).lateNote)

    assertEquals("3 groups", Work(snapshot(unreadChats = 8, unreadGroups = 3, review = 0), now, ist).groupsNote)
    assertEquals("1 group", Work(snapshot(unreadChats = 2, unreadGroups = 1, review = 0), now, ist).groupsNote)
    assertNull(Work(snapshot(unreadChats = 2, unreadGroups = 0, review = 0), now, ist).groupsNote)
    assertNull(Work(snapshot(unreadChats = 0, unreadGroups = 2, review = 0), now, ist).groupsNote) // stale groups, nothing unread
  }

  @Test
  fun `the Owner's large board is tiles then reminders, as many as fit`() {
    // padding 32 + tiles 80 + 10, then 30dp rows with 7dp gaps
    assertEquals(3, ownerLargeRows(240f, 1f, reminders = 7)) // the smallest large board
    assertEquals(7, ownerLargeRows(380f, 1f, reminders = 9))
    assertEquals(7, ownerLargeRows(400f, 1f, reminders = 9))
    assertEquals(8, ownerLargeRows(420f, 1f, reminders = 9))
    assertEquals(10, ownerLargeRows(520f, 1f, reminders = 40)) // the tallest layout step
    assertEquals(MAX_OWNER_REMINDER_ROWS, ownerLargeRows(900f, 1f, reminders = 40))
    // never more than there are
    assertEquals(4, ownerLargeRows(520f, 1f, reminders = 4))
    assertEquals(0, ownerLargeRows(520f, 1f, reminders = 0))
    // more than the old board's 2 (4 with nothing to review) at the same height
    assertTrue(ownerLargeRows(370f, 1f, reminders = 7) >= 6)
    // bigger text, fewer rows; too short for one row, none
    assertEquals(5, ownerLargeRows(380f, 1.3f, reminders = 9))
    assertEquals(0, ownerLargeRows(140f, 1f, reminders = 9))
  }
}
