import WidgetKit
import SwiftUI

// KBiz 360 home-screen widget. Renders the JSON snapshot the RN app writes into the shared
// App Group (src/services/widget.ts) — the widget itself never talks to the network.

private let appGroup = "group.com.kingsgroup.kbiz360"
private let snapshotKey = "widgetSnapshot"

// MARK: - Snapshot model (mirrors WidgetSnapshot in src/services/widget.ts)

struct ReminderItem: Codable, Identifiable {
    let id: String
    let text: String
    let when: String
}

struct Snapshot: Codable {
    var signedIn: Bool
    var userName: String
    var unreadChats: Int
    var reminderCount: Int
    var attendanceIn: String?
    var attendanceOut: String?
    var reminders: [ReminderItem]
    var updatedAt: Double?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        signedIn = try c.decodeIfPresent(Bool.self, forKey: .signedIn) ?? false
        userName = try c.decodeIfPresent(String.self, forKey: .userName) ?? ""
        unreadChats = try c.decodeIfPresent(Int.self, forKey: .unreadChats) ?? 0
        reminderCount = try c.decodeIfPresent(Int.self, forKey: .reminderCount) ?? 0
        attendanceIn = try c.decodeIfPresent(String.self, forKey: .attendanceIn)
        attendanceOut = try c.decodeIfPresent(String.self, forKey: .attendanceOut)
        reminders = try c.decodeIfPresent([ReminderItem].self, forKey: .reminders) ?? []
        updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt)
    }
}

func loadSnapshot() -> Snapshot? {
    guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
          let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
}

// MARK: - Timeline

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snapshot: loadSnapshot()) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // Data only changes when the app writes a new snapshot (it calls reloadWidget then);
        // the 30-minute refresh just keeps the "updated" feel without burning the budget.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [Entry(date: Date(), snapshot: loadSnapshot())], policy: .after(next)))
    }
}

// MARK: - Shared pieces

struct AttendanceLine: View {
    let snapshot: Snapshot
    var body: some View {
        let checkedIn = snapshot.attendanceIn != nil && snapshot.attendanceOut == nil
        let dotColor: Color = checkedIn ? Color("brandGreen") : (snapshot.attendanceOut != nil ? Color("brandOrange") : Color("textMute"))
        HStack(spacing: 5) {
            Circle().fill(dotColor).frame(width: 7, height: 7)
            if let out = snapshot.attendanceOut {
                Text("Out \(out)")
            } else if let inT = snapshot.attendanceIn {
                Text("In since \(inT)")
            } else {
                Text("Not checked in")
            }
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundColor(Color("textMute"))
        .lineLimit(1)
    }
}

struct Header: View {
    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(Color("brandGreen")).frame(width: 6, height: 6)
            Text("KBiz 360")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color("textMute"))
            Spacer()
        }
    }
}

// MARK: - Small: counts + attendance

struct SmallView: View {
    let snapshot: Snapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Header()
            Spacer(minLength: 2)
            Text("\(snapshot.unreadChats)")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundColor(Color("brandGreen"))
            Text(snapshot.unreadChats == 1 ? "Unread chat" : "Unread chats")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color("textMain"))
            Spacer(minLength: 2)
            HStack(spacing: 5) {
                Image(systemName: "bell.badge.fill")
                    .font(.system(size: 10))
                    .foregroundColor(Color("brandPurple"))
                Text("\(snapshot.reminderCount) reminders")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color("textMute"))
            }
            AttendanceLine(snapshot: snapshot)
        }
        .widgetURL(URL(string: "kbiz360://"))
    }
}

// MARK: - Medium: counts column + reminders list

struct MediumView: View {
    let snapshot: Snapshot
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Header()
                Spacer(minLength: 0)
                Link(destination: URL(string: "kbiz360://")!) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("\(snapshot.unreadChats)")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundColor(Color("brandGreen"))
                        Text(snapshot.unreadChats == 1 ? "Unread chat" : "Unread chats")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color("textMain"))
                    }
                }
                Spacer(minLength: 0)
                Link(destination: URL(string: "kbiz360://attendance")!) { AttendanceLine(snapshot: snapshot) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Reminders")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color("textMute"))
                    Spacer()
                    if snapshot.reminderCount > 0 {
                        Text("\(snapshot.reminderCount)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(Color("brandPurple"))
                    }
                }
                if snapshot.reminders.isEmpty {
                    Spacer()
                    Text("All caught up 🎉")
                        .font(.system(size: 12))
                        .foregroundColor(Color("textMute"))
                    Spacer()
                } else {
                    ForEach(snapshot.reminders.prefix(3)) { r in
                        Link(destination: URL(string: "kbiz360://reminders")!) {
                            HStack(alignment: .top, spacing: 6) {
                                Circle()
                                    .strokeBorder(Color("brandPurple"), lineWidth: 1.5)
                                    .frame(width: 12, height: 12)
                                    .padding(.top, 1)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(r.text)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(Color("textMain"))
                                        .lineLimit(1)
                                    if !r.when.isEmpty {
                                        Text(r.when)
                                            .font(.system(size: 10))
                                            .foregroundColor(Color("textMute"))
                                            .lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// MARK: - Signed-out / no-data state

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Circle().fill(Color("brandGreen")).frame(width: 8, height: 8)
            Text("KBiz 360")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color("textMain"))
            Text("Open the app to sign in")
                .font(.system(size: 11))
                .foregroundColor(Color("textMute"))
        }
        .widgetURL(URL(string: "kbiz360://"))
    }
}

// MARK: - Widget

struct KBiz360WidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry

    var body: some View {
        Group {
            if let s = entry.snapshot, s.signedIn {
                switch family {
                case .systemMedium: MediumView(snapshot: s)
                default: SmallView(snapshot: s)
                }
            } else {
                EmptyStateView()
            }
        }
        .containerBackground(for: .widget) { Color("widgetBg") }
    }
}

struct KBiz360Widget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KBiz360Widget", provider: Provider()) { entry in
            KBiz360WidgetView(entry: entry)
        }
        .configurationDisplayName("KBiz 360")
        .description("Unread chats, reminders and today's attendance at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct KBiz360WidgetBundle: WidgetBundle {
    var body: some Widget {
        KBiz360Widget()
    }
}
