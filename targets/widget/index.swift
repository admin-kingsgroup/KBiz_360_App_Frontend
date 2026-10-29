import WidgetKit
import SwiftUI

// KBiz 360 home-screen widgets. Every widget renders the JSON snapshot the RN app writes into the
// shared App Group (src/services/widget.ts; shape in src/logic/widgetSnapshot.ts) — the extension
// never talks to the network. Reminders carry their due time, so "late" and "due today" are
// re-checked on the widget's own clock between app opens (see timelineDates).
//
//   KBiz 360    (KBiz360Widget)  small · medium   the first widget: unread chats, reminders, punch
//   Work Board  (KBizWorkBoard)  medium · large   reminders, approvals, chats and punch together
//
// Android has the same Work Board (modules/kbiz-widget), drawn from the same snapshot.

private let appGroup = "group.com.kingsgroup.kbiz360"
private let snapshotKey = "widgetSnapshot"

let homeURL = URL(string: "kbiz360://")!
let remindersURL = URL(string: "kbiz360://reminders")!
let approvalsURL = URL(string: "kbiz360://approvals")!
let attendanceURL = URL(string: "kbiz360://attendance")!
func chatURL(_ id: String) -> URL { URL(string: "kbiz360://chat/\(id)") ?? homeURL }

func msDate(_ ms: Double?) -> Date? { ms.map { Date(timeIntervalSince1970: $0 / 1000) } }

// MARK: - Snapshot model (mirrors WidgetSnapshot in src/logic/widgetSnapshot.ts)

struct ReminderItem: Codable, Identifiable {
    var id: String
    var text: String
    var when: String
    /// Due time, epoch ms.
    var dueAt: Double?
    /// Who set it; empty when it is my own.
    var by: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        when = try c.decodeIfPresent(String.self, forKey: .when) ?? ""
        dueAt = try c.decodeIfPresent(Double.self, forKey: .dueAt)
        by = try c.decodeIfPresent(String.self, forKey: .by) ?? ""
    }

    var due: Date? { msDate(dueAt) }
    /// The server's rule: a pending reminder is overdue once its due time has passed.
    func isLate(at now: Date) -> Bool { due.map { $0 < now } ?? false }
}

struct ChatItem: Codable, Identifiable {
    var id: String
    var name: String
    var preview: String
    var unread: Int
    /// Last activity, epoch ms.
    var at: Double?
    var group: Bool

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        preview = try c.decodeIfPresent(String.self, forKey: .preview) ?? ""
        unread = try c.decodeIfPresent(Int.self, forKey: .unread) ?? 0
        at = try c.decodeIfPresent(Double.self, forKey: .at)
        group = try c.decodeIfPresent(Bool.self, forKey: .group) ?? false
    }
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
    // Added with the work widgets (2026-10). Absent from snapshots written by older app versions.
    var unreadMessages: Int
    var chats: [ChatItem]
    var reminderForMe: Int?
    var approvals: Int
    var attendanceInAt: Double?
    var attendanceOutAt: Double?

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
        unreadMessages = try c.decodeIfPresent(Int.self, forKey: .unreadMessages) ?? 0
        chats = try c.decodeIfPresent([ChatItem].self, forKey: .chats) ?? []
        reminderForMe = try c.decodeIfPresent(Int.self, forKey: .reminderForMe)
        approvals = try c.decodeIfPresent(Int.self, forKey: .approvals) ?? 0
        attendanceInAt = try c.decodeIfPresent(Double.self, forKey: .attendanceInAt)
        attendanceOutAt = try c.decodeIfPresent(Double.self, forKey: .attendanceOutAt)
    }
}

func loadSnapshot() -> Snapshot? {
    guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: snapshotKey),
          let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: data)
}

extension Snapshot {
    /// Example work for the widget gallery (someone not signed in yet) and the placeholder.
    static func sample(now: Date = Date(), name: String = "") -> Snapshot {
        let at = { (minutes: Double) in (now.timeIntervalSince1970 + minutes * 60) * 1000 }
        let json: [String: Any] = [
            "signedIn": true, "userName": name,
            "unreadChats": 3, "unreadMessages": 9,
            "reminderCount": 8, "reminderForMe": 7, "approvals": 5,
            "attendanceInAt": at(-192), "updatedAt": at(-2),
            "reminders": [
                ["id": "s1", "text": "Send AMD monthly revenue snapshot", "dueAt": at(-150), "by": "Farhan Aga"],
                ["id": "s2", "text": "Reconcile BSP refunds for week 43", "dueAt": at(-26 * 60), "by": "Faiz Khan"],
                ["id": "s3", "text": "Call Skyline Corp about the open invoice", "dueAt": at(45), "by": ""],
                ["id": "s4", "text": "Approve Hotel Kings Palace setup checklist", "dueAt": at(190), "by": "Pravesh Jha"],
                ["id": "s5", "text": "Share Bali itinerary v3 with the client", "dueAt": at(25 * 60), "by": "Riya Patel"],
                ["id": "s6", "text": "Q3 strategic priorities document", "dueAt": at(3 * 24 * 60), "by": "Farhan Aga"],
                ["id": "s7", "text": "Renew office insurance", "by": ""],
            ],
            "chats": [
                ["id": "c1", "name": "MHUB - Branch Accounts", "preview": "Faiz: BSP statement for week 43 is uploaded", "unread": 5, "at": at(-6), "group": true],
                ["id": "c2", "name": "Farhan Aga", "preview": "Please check the Rezlive invoice before 5", "unread": 2, "at": at(-22), "group": false],
                ["id": "c3", "name": "Ticket Support", "preview": "New ticket: refund for PNR 6XK2QP", "unread": 2, "at": at(-58), "group": true],
            ],
        ]
        // Constant, valid JSON: neither call can fail.
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! JSONDecoder().decode(Snapshot.self, from: data)
    }
}

// MARK: - Timeline

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

/// Redraw points for the next 4 hours: every 15 minutes, the moment each reminder falls due (so it
/// turns red on time, app closed or not) and midnight (punch and "today" start over). The app also
/// reloads every widget whenever it writes a fresh snapshot.
func timelineDates(from now: Date, snapshot: Snapshot?) -> [Date] {
    let horizon = now.addingTimeInterval(4 * 3600)
    var dates = Set((0...16).map { now.addingTimeInterval(Double($0) * 900) })
    for r in snapshot?.reminders ?? [] {
        if let d = r.due, d > now, d < horizon { dates.insert(d) }
    }
    if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime),
       midnight < horizon {
        dates.insert(midnight)
    }
    return dates.sorted()
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snapshot: .sample()) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        let now = Date()
        let real = loadSnapshot()
        // In the widget gallery, someone not signed in yet sees example work instead of an empty card.
        let snapshot = context.isPreview && real?.signedIn != true ? Snapshot.sample(now: now) : real
        completion(Entry(date: now, snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let snapshot = loadSnapshot()
        let entries = timelineDates(from: Date(), snapshot: snapshot).map { Entry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Work: the snapshot read at one moment

enum Punch {
    case notIn
    case onDuty(since: Date)
    case done(from: Date, to: Date)
}

struct Work {
    let s: Snapshot
    let now: Date
    /// Soonest due first (late ones lead), undated last in the app's order.
    let items: [ReminderItem]

    init(_ s: Snapshot, now: Date) {
        self.s = s
        self.now = now
        items = s.reminders.enumerated().sorted { a, b in
            switch (a.element.due, b.element.due) {
            case let (x?, y?): return x < y
            case (.some, nil): return true
            case (nil, .some): return false
            default: return a.offset < b.offset
            }
        }.map(\.element)
    }

    var late: Int { items.filter { $0.isLate(at: now) }.count }
    /// Pending reminders set for me — the app's "For me" list.
    var todo: Int { s.reminderForMe ?? s.reminderCount }

    var firstName: String { s.userName.split(separator: " ").first.map(String.init) ?? "" }
    var greeting: String {
        let h = Calendar.current.component(.hour, from: now)
        return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
    }
    var greetingLine: String { firstName.isEmpty ? greeting : "\(greeting), \(firstName)" }

    /// Today's punch. A punch from an earlier day (app not opened since) counts as not checked in.
    var punch: Punch {
        guard let inAt = msDate(s.attendanceInAt), Calendar.current.isDate(inAt, inSameDayAs: now) else { return .notIn }
        if let outAt = msDate(s.attendanceOutAt), outAt >= inAt { return .done(from: inAt, to: outAt) }
        return .onDuty(since: inAt)
    }

}

// MARK: - Palette and formatting

extension Color {
    static let kBg = Color("widgetBg")
    static let kTile = Color("tileBg")
    static let kMain = Color("textMain")
    static let kMute = Color("textMute")
    static let kGreen = Color("brandGreen")
    static let kPrimary = Color("brandPrimary")
    static let kPurple = Color("brandPurple")
    static let kOrange = Color("brandOrange")
    static let kDanger = Color("brandDanger")
}

enum Tone {
    case danger, warn, purple, primary, green, neutral

    var solid: Color {
        switch self {
        case .danger: return .kDanger
        case .warn: return .kOrange
        case .purple: return .kPurple
        case .primary: return .kPrimary
        case .green: return .kGreen
        case .neutral: return .kMute.opacity(0.45)
        }
    }

    var soft: Color {
        switch self {
        case .danger: return Color("dangerSoft")
        case .warn: return Color("warnSoft")
        case .purple: return Color("purpleSoft")
        case .primary, .green: return Color("primarySoft")
        case .neutral: return .kTile
        }
    }

    var text: Color {
        switch self {
        case .danger: return Color("dangerText")
        case .warn: return Color("warnText")
        case .purple: return Color("purpleText")
        case .primary, .green: return Color("primaryText")
        case .neutral: return .kMute
        }
    }
}

func clock(_ d: Date) -> String { d.formatted(date: .omitted, time: .shortened) }

func duration(_ seconds: TimeInterval) -> String {
    let m = max(0, Int(seconds / 60))
    return m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m)m"
}

func ago(_ d: Date, now: Date) -> String {
    let m = Int(now.timeIntervalSince(d) / 60)
    if m < 1 { return "now" }
    if m < 60 { return "\(m)m" }
    if m < 24 * 60 { return "\(m / 60)h" }
    return d.formatted(.dateTime.day().month(.abbreviated))
}

struct DueLabel {
    let text: String
    let tone: Tone
}

/// How a reminder's due time reads in a row: "2h late" (red), "3:00 PM" today (amber), "Tomorrow",
/// a weekday this week, else the date. Undated ones fall back to the app's own label.
func dueLabel(_ r: ReminderItem, now: Date) -> DueLabel {
    guard let d = r.due else { return DueLabel(text: r.when.isEmpty ? "No date" : r.when, tone: .neutral) }
    if d < now {
        let m = Int(now.timeIntervalSince(d) / 60)
        let text = m < 60 ? "\(max(m, 1))m late" : m < 24 * 60 ? "\(m / 60)h late" : "\(m / (24 * 60))d late"
        return DueLabel(text: text, tone: .danger)
    }
    let cal = Calendar.current
    if cal.isDate(d, inSameDayAs: now) { return DueLabel(text: clock(d), tone: .warn) }
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: d)).day ?? 0
    if days == 1 { return DueLabel(text: "Tomorrow", tone: .primary) }
    if days < 7 { return DueLabel(text: d.formatted(.dateTime.weekday(.abbreviated)), tone: .primary) }
    return DueLabel(text: d.formatted(.dateTime.day().month(.abbreviated)), tone: .primary)
}

// MARK: - Shared pieces

/// The KBiz 360 flower from the app icon, drawn so it stays crisp at any size.
struct BrandMark: View {
    var size: CGFloat = 16
    private static let petals: [Color] = [
        Color(red: 0.847, green: 0.827, blue: 0.784), // cream
        Color(red: 0.310, green: 0.545, blue: 1.000), // blue
        Color(red: 0.216, green: 0.714, blue: 0.643), // teal
        Color(red: 0.910, green: 0.631, blue: 0.227), // orange
        Color(red: 0.890, green: 0.404, blue: 0.306), // coral
        Color(red: 0.604, green: 0.424, blue: 0.941), // purple
    ]
    var body: some View {
        let k = size / 600
        ZStack {
            ForEach(0..<6, id: \.self) { i in
                RoundedRectangle(cornerRadius: 40 * k, style: .continuous)
                    .fill(Self.petals[i])
                    .frame(width: 188 * k, height: 270 * k)
                    .offset(x: 63 * k, y: -135 * k)
                    .rotationEffect(.degrees(Double(i) * 60))
            }
            Circle().fill(Color.kBg).frame(width: 170 * k, height: 170 * k)
        }
        .frame(width: size, height: size)
    }
}

struct Chip: View {
    let text: String
    let tone: Tone
    var icon: String? = nil
    var body: some View {
        HStack(spacing: 3) {
            if let icon { Image(systemName: icon).font(.system(size: 7.5, weight: .heavy)) }
            Text(text).font(.system(size: 10, weight: .semibold)).lineLimit(1)
        }
        .foregroundColor(tone.text)
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(Capsule().fill(tone.soft))
        .fixedSize()
    }
}

struct IconBadge: View {
    let symbol: String
    let tone: Tone
    var size: CGFloat = 22
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            .fill(tone.soft)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: symbol)
                    .font(.system(size: size * 0.5, weight: .semibold))
                    .foregroundColor(tone == .neutral ? .kMute : tone.solid)
            )
    }
}

struct SectionLabel: View {
    let title: String
    var trailing: String = ""
    var body: some View {
        HStack {
            Text(title.uppercased()).font(.system(size: 9.5, weight: .bold)).kerning(0.4).foregroundColor(.kMute)
            Spacer()
            if !trailing.isEmpty { Text(trailing).font(.system(size: 9.5, weight: .semibold)).foregroundColor(.kMute) }
        }
    }
}

struct ReminderRow: View {
    let r: ReminderItem
    let now: Date
    var body: some View {
        let due = dueLabel(r, now: now)
        HStack(spacing: 8) {
            Capsule().fill(due.tone.solid).frame(width: 3.5, height: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text(r.text.isEmpty ? "Reminder" : r.text)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundColor(.kMain)
                    .lineLimit(1)
                    .privacySensitive()
                Text(r.by.isEmpty ? "Myself" : "From \(r.by)")
                    .font(.system(size: 10))
                    .foregroundColor(.kMute)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text(due.text)
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundColor(due.tone.text)
                .lineLimit(1)
        }
    }
}

struct Avatar: View {
    let name: String
    let group: Bool
    var size: CGFloat = 28
    var body: some View {
        // "MHUB - Branch Accounts" → "MB": words that start with a letter or digit only.
        let initials = name.split(separator: " ").compactMap(\.first).filter { $0.isLetter || $0.isNumber }
            .prefix(2).map(String.init).joined().uppercased()
        let tone: Tone = group ? .purple : .primary
        Circle()
            .fill(tone.soft)
            .frame(width: size, height: size)
            .overlay(
                Text(initials.isEmpty ? "?" : initials)
                    .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                    .foregroundColor(tone.text)
            )
    }
}

struct ChatRow: View {
    let c: ChatItem
    let now: Date
    var body: some View {
        Link(destination: chatURL(c.id)) {
            HStack(spacing: 8) {
                Avatar(name: c.name, group: c.group)
                VStack(alignment: .leading, spacing: 1) {
                    Text(c.name).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.kMain).lineLimit(1)
                    Text(c.preview.isEmpty ? "New message" : c.preview)
                        .font(.system(size: 10.5))
                        .foregroundColor(.kMute)
                        .lineLimit(1)
                        .privacySensitive()
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 3) {
                    if let at = msDate(c.at) {
                        Text(ago(at, now: now)).font(.system(size: 9.5, weight: .semibold)).foregroundColor(.kGreen)
                    }
                    Text("\(c.unread)")
                        .font(.system(size: 9.5, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(Capsule().fill(Color.kGreen))
                }
            }
        }
    }
}

// MARK: - 1 · KBiz 360 (the first widget, kept as placed on people's phones)

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
        .widgetURL(homeURL)
    }
}

struct MediumView: View {
    let snapshot: Snapshot
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Header()
                Spacer(minLength: 0)
                Link(destination: homeURL) {
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
                Link(destination: attendanceURL) { AttendanceLine(snapshot: snapshot) }
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
                        Link(destination: remindersURL) {
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

// MARK: - 2 · Work Board (medium · large)

struct BoardTile: View {
    let symbol: String
    let tone: Tone
    let value: Text
    let label: String
    let url: URL
    var badge: String? = nil
    var body: some View {
        Link(destination: url) {
            HStack(spacing: 8) {
                IconBadge(symbol: symbol, tone: tone, size: 26)
                VStack(alignment: .leading, spacing: 0) {
                    value
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(.kMain)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(label).font(.system(size: 10, weight: .medium)).foregroundColor(.kMute).lineLimit(1)
                }
                Spacer(minLength: 0)
                if let badge { Chip(text: badge, tone: .danger) }
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.kTile))
        }
    }
}

struct StatTile: View {
    let symbol: String
    let tone: Tone
    let value: Int
    let label: String
    let url: URL
    var alert = false
    var body: some View {
        Link(destination: url) {
            VStack(alignment: .leading, spacing: 0) {
                Image(systemName: symbol).font(.system(size: 12, weight: .semibold)).foregroundColor(tone.solid)
                Spacer(minLength: 0)
                Text("\(value)")
                    .font(.system(size: 21, weight: .bold, design: .rounded))
                    .foregroundColor(alert && value > 0 ? tone.solid : .kMain)
                Text(label).font(.system(size: 9.5, weight: .semibold)).foregroundColor(.kMute).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 66)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.kTile))
        }
    }
}

struct PunchPill: View {
    let w: Work
    var body: some View {
        Link(destination: attendanceURL) {
            HStack(spacing: 4) {
                switch w.punch {
                case .onDuty(let since):
                    Circle().fill(Color.kGreen).frame(width: 6, height: 6)
                    Text(since, style: .timer).monospacedDigit().foregroundColor(Tone.green.text)
                case .done(let from, let to):
                    Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundColor(Tone.warn.text)
                    Text(duration(to.timeIntervalSince(from))).foregroundColor(Tone.warn.text)
                case .notIn:
                    Circle().strokeBorder(Color.kMute, lineWidth: 1.2).frame(width: 6, height: 6)
                    Text("Not in").foregroundColor(.kMute)
                }
            }
            .font(.system(size: 10.5, weight: .bold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(punchFill))
            .fixedSize()
        }
    }

    private var punchFill: Color {
        switch w.punch {
        case .onDuty: return Tone.green.soft
        case .done: return Tone.warn.soft
        case .notIn: return .kTile
        }
    }
}

struct WorkBoardMedium: View {
    let w: Work
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                BrandMark(size: 16)
                Text(w.greetingLine).font(.system(size: 13, weight: .bold)).foregroundColor(.kMain).lineLimit(1)
                Spacer(minLength: 4)
                Text(w.now.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)))
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundColor(.kMute)
            }
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    BoardTile(symbol: "bell.fill", tone: .purple, value: Text("\(w.todo)"), label: "Reminders", url: remindersURL,
                              badge: w.late > 0 ? "\(w.late) late" : nil)
                    BoardTile(symbol: "checkmark.seal.fill", tone: .primary, value: Text("\(w.s.approvals)"), label: "Approvals", url: approvalsURL)
                }
                HStack(spacing: 6) {
                    BoardTile(symbol: "bubble.left.and.bubble.right.fill", tone: .green, value: Text("\(w.s.unreadChats)"),
                              label: w.s.unreadChats == 1 ? "Unread chat" : "Unread chats", url: homeURL)
                    attendanceTile
                }
            }
        }
    }

    @ViewBuilder private var attendanceTile: some View {
        switch w.punch {
        case .onDuty(let since):
            BoardTile(symbol: "clock.fill", tone: .green, value: Text(since, style: .timer), label: "In since \(clock(since))", url: attendanceURL)
        case .done(let from, let to):
            BoardTile(symbol: "clock.fill", tone: .warn, value: Text(duration(to.timeIntervalSince(from))), label: "Worked today", url: attendanceURL)
        case .notIn:
            BoardTile(symbol: "faceid", tone: .neutral, value: Text("Check in"), label: "Not checked in", url: attendanceURL)
        }
    }
}

struct WorkBoardLarge: View {
    let w: Work
    var body: some View {
        let chats = Array(w.s.chats.prefix(2))
        let reminderLimit = chats.isEmpty ? 4 : 3
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                BrandMark(size: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(w.greetingLine).font(.system(size: 15, weight: .bold)).foregroundColor(.kMain).lineLimit(1)
                    Text(w.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundColor(.kMute)
                }
                Spacer(minLength: 4)
                PunchPill(w: w)
            }
            HStack(spacing: 6) {
                StatTile(symbol: "bell.fill", tone: .purple, value: w.todo, label: "Reminders", url: remindersURL)
                StatTile(symbol: "exclamationmark.circle.fill", tone: .danger, value: w.late, label: "Late", url: remindersURL, alert: true)
                StatTile(symbol: "checkmark.seal.fill", tone: .primary, value: w.s.approvals, label: "Approvals", url: approvalsURL)
                StatTile(symbol: "bubble.left.fill", tone: .green, value: w.s.unreadChats, label: "Chats", url: homeURL)
            }
            SectionLabel(title: "Next up", trailing: w.todo > 0 ? "\(w.todo) open" : "")
            if w.items.isEmpty {
                Text("No reminders waiting for you").font(.system(size: 11.5)).foregroundColor(.kMute)
            } else {
                VStack(alignment: .leading, spacing: 7) {
                    ForEach(w.items.prefix(reminderLimit)) { r in
                        Link(destination: remindersURL) { ReminderRow(r: r, now: w.now) }
                    }
                }
            }
            SectionLabel(title: "Unread chats", trailing: w.s.unreadMessages > 0 ? "\(w.s.unreadMessages) \(w.s.unreadMessages == 1 ? "message" : "messages")" : "")
            if chats.isEmpty {
                Text("All chats read").font(.system(size: 11.5)).foregroundColor(.kMute)
            } else {
                VStack(spacing: 7) {
                    ForEach(chats) { c in ChatRow(c: c, now: w.now) }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Signed-out states

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            BrandMark(size: 26)
            Text("KBiz 360")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.kMain)
            Text("Open the app to sign in")
                .font(.system(size: 11))
                .foregroundColor(.kMute)
        }
        .widgetURL(homeURL)
    }
}

// MARK: - Widgets

/// Signed in → the widget's own view for this moment; signed out → the "open the app" card.
struct WidgetShell<Content: View>: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    @ViewBuilder let content: (Work, WidgetFamily) -> Content

    var body: some View {
        Group {
            if let s = entry.snapshot, s.signedIn {
                content(Work(s, now: entry.date), family)
            } else {
                EmptyStateView()
            }
        }
        .containerBackground(for: .widget) { Color.kBg }
    }
}

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
        .containerBackground(for: .widget) { Color.kBg }
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

struct WorkBoardWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "KBizWorkBoard", provider: Provider()) { entry in
            WidgetShell(entry: entry) { w, family in
                if family == .systemLarge { WorkBoardLarge(w: w) } else { WorkBoardMedium(w: w) }
            }
        }
        .configurationDisplayName("Work Board")
        .description("Reminders, approvals, unread chats and attendance together.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct KBiz360WidgetBundle: WidgetBundle {
    var body: some Widget {
        KBiz360Widget()
        WorkBoardWidget()
    }
}
