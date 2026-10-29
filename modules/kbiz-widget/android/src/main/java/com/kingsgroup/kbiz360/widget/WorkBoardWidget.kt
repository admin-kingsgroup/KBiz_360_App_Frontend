package com.kingsgroup.kbiz360.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import java.util.TimeZone

/** Where the app's snapshot lives on the phone (the Android twin of the iOS App Group). */
internal object SnapshotStore {
  private const val PREFS = "kbiz_widget"
  private const val KEY = "widgetSnapshot"

  fun save(ctx: Context, json: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
  }

  fun load(ctx: Context): Snapshot? = parseSnapshot(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null))
}

/**
 * The Work Board home-screen widget. It redraws whenever the app writes a fresh snapshot, and on
 * its own at the moments the board changes without new data (a reminder falling due, noon, 5 pm,
 * midnight, every 30 minutes) so a late reminder turns red even while the app is closed.
 */
class WorkBoardWidget : AppWidgetProvider() {

  override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) = redraw(ctx, manager, ids)

  override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: Bundle) =
    redraw(ctx, manager, intArrayOf(id))

  override fun onDisabled(ctx: Context) = cancelRedraw(ctx)

  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action == ACTION_REDRAW) redrawAll(ctx) else super.onReceive(ctx, intent)
  }

  companion object {
    private const val ACTION_REDRAW = "com.kingsgroup.kbiz360.widget.REDRAW"

    /** Redraw every placed Work Board from the stored snapshot. Cheap when none is placed. */
    fun redrawAll(ctx: Context) {
      val manager = AppWidgetManager.getInstance(ctx)
      val ids = manager.getAppWidgetIds(ComponentName(ctx, WorkBoardWidget::class.java))
      if (ids.isEmpty()) {
        cancelRedraw(ctx)
        return
      }
      redraw(ctx, manager, ids)
    }

    private fun redraw(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
      val snapshot = SnapshotStore.load(ctx)
      val now = System.currentTimeMillis()
      val zone = TimeZone.getDefault()
      for (id in ids) {
        val views = if (snapshot?.signedIn == true) {
          WorkBoardViews.build(ctx, Work(snapshot, now, zone), manager.getAppWidgetOptions(id))
        } else {
          WorkBoardViews.signedOut(ctx)
        }
        manager.updateAppWidget(id, views)
      }
      scheduleRedraw(ctx, nextRedraw(now, snapshot, zone))
    }

    private fun redrawIntent(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
      ctx,
      0,
      Intent(ctx, WorkBoardWidget::class.java).setAction(ACTION_REDRAW),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** How late a scheduled redraw may land. Android 12+ will not batch tighter without the exact-alarm permission. */
    private const val REDRAW_WINDOW_MS = 10 * 60_000L

    /**
     * A windowed alarm that does not wake the phone: it lands within [REDRAW_WINDOW_MS] of [at], or
     * as soon as the screen comes on if it was off, which is when someone can see the widget. Needs
     * no exact-alarm permission. Replaces the previous one.
     */
    private fun scheduleRedraw(ctx: Context, at: Long) {
      val alarms = ctx.getSystemService(AlarmManager::class.java) ?: return
      alarms.setWindow(AlarmManager.RTC, at, REDRAW_WINDOW_MS, redrawIntent(ctx))
    }

    private fun cancelRedraw(ctx: Context) {
      ctx.getSystemService(AlarmManager::class.java)?.cancel(redrawIntent(ctx))
    }
  }
}
