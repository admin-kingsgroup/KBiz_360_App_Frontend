package com.kingsgroup.kbiz360.widget

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.max
import kotlin.math.min

// The snapshot the app writes (src/logic/widgetSnapshot.ts) and the rules the widget applies to it.
// Mirrors targets/widget/index.swift so the Android and iOS Work Boards read the same way.
// Nothing in this file touches Android views, so it runs in plain JVM unit tests.

data class ReminderItem(
  val id: String,
  val text: String,
  /** The app's own label, used when there is no due time. */
  val whenLabel: String,
  /** Due time, epoch ms. */
  val dueAt: Long?,
  /** Who set it; empty when it is my own. */
  val by: String,
) {
  /** The server's rule: a pending reminder is overdue once its due time has passed. */
  fun isLate(now: Long): Boolean = dueAt != null && dueAt < now
}

data class ChatItem(
  val id: String,
  val name: String,
  val preview: String,
  val unread: Int,
  /** Last activity, epoch ms. */
  val at: Long?,
  val group: Boolean,
)

data class Snapshot(
  val signedIn: Boolean,
  val userName: String,
  val unreadChats: Int,
  val unreadMessages: Int,
  val chats: List<ChatItem>,
  val reminderCount: Int,
  val reminderForMe: Int?,
  val reminderReview: Int,
  val reminders: List<ReminderItem>,
  val approvals: Int,
  val attendanceInAt: Long?,
  val attendanceOutAt: Long?,
  val updatedAt: Long?,
)

private fun JSONObject.longOrNull(key: String): Long? =
  if (!has(key) || isNull(key)) null else (opt(key) as? Number)?.toLong()

private fun JSONObject.intOr(key: String, fallback: Int): Int =
  if (!has(key) || isNull(key)) fallback else (opt(key) as? Number)?.toInt() ?: fallback

private fun JSONObject.str(key: String): String = if (!has(key) || isNull(key)) "" else optString(key, "")

private inline fun <T> JSONArray?.mapObjects(block: (JSONObject) -> T): List<T> {
  if (this == null) return emptyList()
  return (0 until length()).mapNotNull { i -> optJSONObject(i)?.let(block) }
}

/** Every field is optional, like the Swift decoder: a snapshot from an older app version still reads. */
fun parseSnapshot(json: String?): Snapshot? {
  if (json.isNullOrBlank()) return null
  return try {
    val o = JSONObject(json)
    Snapshot(
      signedIn = o.optBoolean("signedIn", false),
      userName = o.str("userName"),
      unreadChats = o.intOr("unreadChats", 0),
      unreadMessages = o.intOr("unreadMessages", 0),
      chats = o.optJSONArray("chats").mapObjects { c ->
        ChatItem(
          id = c.str("id"),
          name = c.str("name"),
          preview = c.str("preview"),
          unread = c.intOr("unread", 0),
          at = c.longOrNull("at"),
          group = c.optBoolean("group", false),
        )
      },
      reminderCount = o.intOr("reminderCount", 0),
      reminderForMe = if (o.has("reminderForMe") && !o.isNull("reminderForMe")) o.intOr("reminderForMe", 0) else null,
      reminderReview = o.intOr("reminderReview", 0),
      reminders = o.optJSONArray("reminders").mapObjects { r ->
        ReminderItem(
          id = r.str("id"),
          text = r.str("text"),
          whenLabel = r.str("when"),
          dueAt = r.longOrNull("dueAt"),
          by = r.str("by"),
        )
      },
      approvals = o.intOr("approvals", 0),
      attendanceInAt = o.longOrNull("attendanceInAt"),
      attendanceOutAt = o.longOrNull("attendanceOutAt"),
      updatedAt = o.longOrNull("updatedAt"),
    )
  } catch (e: Exception) {
    null
  }
}

// ---- Time helpers ---------------------------------------------------------------------------

private fun calendar(ms: Long, zone: TimeZone): Calendar = Calendar.getInstance(zone).apply { timeInMillis = ms }

fun sameDay(a: Long, b: Long, zone: TimeZone): Boolean {
  val x = calendar(a, zone)
  val y = calendar(b, zone)
  return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR)
}

fun startOfDay(ms: Long, zone: TimeZone): Long = calendar(ms, zone).apply {
  set(Calendar.HOUR_OF_DAY, 0)
  set(Calendar.MINUTE, 0)
  set(Calendar.SECOND, 0)
  set(Calendar.MILLISECOND, 0)
}.timeInMillis

/** Whole calendar days from now's date to the date of [ms] (0 = today, 1 = tomorrow). */
fun daysBetween(now: Long, ms: Long, zone: TimeZone): Int {
  var a = calendar(startOfDay(now, zone), zone)
  val b = startOfDay(ms, zone)
  var days = 0
  while (a.timeInMillis < b && days < 400) {
    a.add(Calendar.DAY_OF_YEAR, 1)
    days++
  }
  return days
}

/** "8h 52m", "45m". */
fun duration(ms: Long): String {
  val m = max(0L, ms / 60_000)
  return if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
}

// ---- Tones ----------------------------------------------------------------------------------

enum class Tone { DANGER, WARN, PURPLE, PRIMARY, GREEN, NEUTRAL }

/** Turns times into words in the phone's own locale and 12/24-hour setting. */
interface Formats {
  fun time(ms: Long): String
  fun weekday(ms: Long): String
  fun dayMonth(ms: Long): String
}

data class DueLabel(val text: String, val tone: Tone)

/**
 * How a reminder's due time reads in a row: "2h late" (red), "3:00 PM" today (amber), "Tomorrow",
 * a weekday this week, else the date. Undated ones fall back to the app's own label.
 */
fun dueLabel(r: ReminderItem, now: Long, zone: TimeZone, f: Formats): DueLabel {
  val d = r.dueAt ?: return DueLabel(r.whenLabel.ifEmpty { "No date" }, Tone.NEUTRAL)
  if (d < now) {
    val m = (now - d) / 60_000
    val text = when {
      m < 60 -> "${max(m, 1L)}m late"
      m < 24 * 60 -> "${m / 60}h late"
      else -> "${m / (24 * 60)}d late"
    }
    return DueLabel(text, Tone.DANGER)
  }
  if (sameDay(d, now, zone)) return DueLabel(f.time(d), Tone.WARN)
  val days = daysBetween(now, d, zone)
  return when {
    days == 1 -> DueLabel("Tomorrow", Tone.PRIMARY)
    days < 7 -> DueLabel(f.weekday(d), Tone.PRIMARY)
    else -> DueLabel(f.dayMonth(d), Tone.PRIMARY)
  }
}

/** "now", "6m", "3h", else the date. */
fun ago(ms: Long, now: Long, f: Formats): String {
  val m = (now - ms) / 60_000
  return when {
    m < 1 -> "now"
    m < 60 -> "${m}m"
    m < 24 * 60 -> "${m / 60}h"
    else -> f.dayMonth(ms)
  }
}

/** "MHUB - Branch Accounts" → "MB": first letters of words that start with a letter or digit. */
fun initials(name: String): String {
  val s = name.split(' ')
    .mapNotNull { it.firstOrNull() }
    .filter { it.isLetterOrDigit() }
    .take(2)
    .joinToString("")
    .uppercase()
  return s.ifEmpty { "?" }
}

// ---- Work: the snapshot read at one moment --------------------------------------------------

sealed class Punch {
  object NotIn : Punch()
  data class OnDuty(val since: Long) : Punch()
  data class Done(val from: Long, val to: Long) : Punch()
}

class Work(val s: Snapshot, val now: Long, val zone: TimeZone = TimeZone.getDefault()) {
  /** Soonest due first (late ones lead), undated last in the app's order. */
  val items: List<ReminderItem> = s.reminders.withIndex()
    .sortedWith(compareBy<IndexedValue<ReminderItem>>({ it.value.dueAt == null }, { it.value.dueAt ?: 0L }, { it.index }))
    .map { it.value }

  val late: Int get() = items.count { it.isLate(now) }

  /** Pending reminders set for me — the app's "For me" list. */
  val todo: Int get() = s.reminderForMe ?: s.reminderCount

  val firstName: String get() = s.userName.trim().split(' ').firstOrNull().orEmpty()

  val greeting: String
    get() {
      val h = calendar(now, zone).get(Calendar.HOUR_OF_DAY)
      return if (h < 12) "Good morning" else if (h < 17) "Good afternoon" else "Good evening"
    }

  val greetingLine: String get() = if (firstName.isEmpty()) greeting else "$greeting, $firstName"

  /** Today's punch. A punch from an earlier day (app not opened since) counts as not checked in. */
  val punch: Punch
    get() {
      val inAt = s.attendanceInAt ?: return Punch.NotIn
      if (!sameDay(inAt, now, zone)) return Punch.NotIn
      val outAt = s.attendanceOutAt
      return if (outAt != null && outAt >= inAt) Punch.Done(inAt, outAt) else Punch.OnDuty(inAt)
    }
}

// ---- When to redraw -------------------------------------------------------------------------

const val REDRAW_EVERY_MS = 30 * 60_000L

/**
 * The next moment the board reads differently with no new data from the app: the next reminder
 * falling due (it turns red on time, app closed or not), noon and 5 pm (the greeting), midnight
 * (punch and "today" start over), and at most [REDRAW_EVERY_MS] so "2h late" and "6m" keep moving.
 */
fun nextRedraw(now: Long, snapshot: Snapshot?, zone: TimeZone): Long {
  var next = now + REDRAW_EVERY_MS
  snapshot?.reminders?.forEach { r -> r.dueAt?.let { if (it > now) next = min(next, it) } }
  val day = startOfDay(now, zone)
  val noon = calendar(day, zone).apply { set(Calendar.HOUR_OF_DAY, 12) }.timeInMillis
  val evening = calendar(day, zone).apply { set(Calendar.HOUR_OF_DAY, 17) }.timeInMillis
  val midnight = calendar(day, zone).apply { add(Calendar.DAY_OF_YEAR, 1) }.timeInMillis
  listOf(noon, evening, midnight).firstOrNull { it > now }?.let { next = min(next, it) }
  return max(next, now + 60_000L)
}

// ---- How much of the large board fits -------------------------------------------------------

data class LargePlan(val reminderRows: Int, val chatRows: Int, val showChats: Boolean)

const val MAX_REMINDER_ROWS = 6
const val MAX_CHAT_ROWS = 4

/**
 * Rows for a large board [heightDp] tall. First the iOS large board: reminders (up to 3, or 4 when
 * no chat is unread), then the unread-chats section (up to 2) if at least its first row fits. An
 * Android widget can be stretched taller than that, so leftover room takes more reminders (up to
 * [MAX_REMINDER_ROWS]) and then more chats (up to [MAX_CHAT_ROWS]). Heights are the layout's own
 * (kbiz_wb_large and its rows), grown with the phone's font size.
 */
fun largePlan(heightDp: Float, fontScale: Float, reminders: Int, chats: Int): LargePlan {
  val fs = max(1f, fontScale)
  val label = 9f + 13f * fs + 6f
  val reminderRow = 30f * fs
  val chatRow = 31f * fs
  val gap = 7f
  val empty = 15f * fs
  // padding 32 + header + stats (gap 9 + 66) + the "Next up" label
  var budget = heightDp - 32f - 36f * fs - 75f - label

  val remWant = min(reminders, if (chats == 0) 4 else 3)
  var rem = 0
  if (remWant == 0) budget -= empty
  while (rem < remWant) {
    val need = reminderRow + if (rem > 0) gap else 0f
    if (need > budget) break
    budget -= need
    rem++
  }

  val chatWant = min(chats, 2)
  if (budget < label + (if (chatWant == 0) empty else chatRow)) return LargePlan(rem, 0, false)
  budget -= label
  if (chatWant == 0) budget -= empty
  var ch = 0
  while (ch < chatWant) {
    val need = chatRow + if (ch > 0) gap else 0f
    if (need > budget) break
    budget -= need
    ch++
  }

  // Room to spare once the iOS board fits whole (a tall widget): more reminders, then more chats.
  if (rem == remWant && ch == chatWant) {
    while (rem in 1 until min(reminders, MAX_REMINDER_ROWS) && reminderRow + gap <= budget) {
      budget -= reminderRow + gap
      rem++
    }
    while (ch in 1 until min(chats, MAX_CHAT_ROWS) && chatRow + gap <= budget) {
      budget -= chatRow + gap
      ch++
    }
  }
  return LargePlan(rem, ch, true)
}
