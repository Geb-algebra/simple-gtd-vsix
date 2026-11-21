# Simple GTD

A VSCode Extension that manages personal tasks in a simple GTD manner using plain Markdown bullet lists.

## Highlights

- Tool-agnostic data format: Inbox items, classified tasks, and completed tasks are stored as plain Markdown list items (`- Task name`).
- Simple: Focused on providing "what you should do next". No due dates, assignee, priorities or other metadata.
- Rich UI: provides a rich UI that makes you enjoy adding and processing tasks.

## Concepts

Simple GTD creates three files:

```
_tasks/
├── inbox.md
├── tasks.md
└── log.md
```

inbox.md is an inbox in the GTD.
This file only contains a markdown list of all your unclassified tasks.

```md
- Book a dentist appointment
- Look into replacing the desk lamp
- Plan a weekend trip
```

In GTD, items in inbox.md is processed in the diagram:


```text
Item in the inbox
└── Is it actionable?
    ├── No
    │   ├── Delete it
    │   ├── Someday/maybe
    │   └── Store as a reference
    └── Yes → Single step to complete?
        ├── No → Create a project, then apply the two-minute check to its first subtask
        └── Yes → Takes less than 2 minutes?
            ├── Yes → Do it now!
            └── No → Who has to do it?
                ├── Someone else → Delegate → Waiting for
                └── You → Specific date?
                    ├── Yes → Calendar
                    └── No → Next actions by context
```
<https://en.wikipedia.org/wiki/Getting_Things_Done>

tasks.md is a task list classified by this GTD diagram.
This file has three sections for classification.

```md
## Next Actions

- foo

## Someday

- bar

## Waiting for

- baz @David

## Do at

<!-- 
Tasks scheduled for a specific calendar date.
Write the date as `@YYYY-MM-DD`.
 -->

- hoge @2026-08-07
```

Simple GTD delegates project creation to an arbitrary vscode commands.
inboxのアイテムからプロジェクトをどのように作るかは、人によって大きく異なる。
プロジェクト用のディレクトリを生成したい、自動命名して特定のファイルを含めたリポジトリにしたい、外部アプリに登録したい、など。
これらを全てこの拡張でサポートできない。
そのため、この拡張は、プロジェクト化を、「設定で指定したVSCode commandを実行する」という形でサポートする。

完了したタスクは、log.mdに日毎に記録される。
これによりタスクのベロシティや作業生産性を測ったり、単にモチベーションを上げたりできる。

```md
# log

<!-- any content -->

## 260807

- goo
- bar

## 260806
...
```

## interfaces

Simple GTDはタスク管理をわかりやすく、簡単に、楽しくするためのリッチなUIを持つ。
これをサイドバーなどに常駐させてタスク管理を行う使い方を想定する。

UIはinbox処理、Next Action提示、タスク一覧、ログ鑑賞の3つの機能を持つ。

### inbox処理

inboxのアイテム全てを重なったカードのように表示し、一番上のカードをトップに表示する。
このカードに対して、十字キーで処理する。

- Enter Next Actions
- → Waiting (キー押下後に担当者ダイアログ)
- ← Do at / someday (キー押下後に日付入力ダイアログ。空欄でsomeday)
- ↓ Done (すぐ終わるタスク)
- ↑ Project (その場で設定コマンド実行)

ダイアログの入力欄は自動フォーカスし、入力してenterで確定。 キー操作だけで操作が完結する。

ctrl/cmd + zでundo, ctrl/cmd + shift + zでredo。

操作結果は即座にmarkdownファイル群に反映される。

### Next Action提示 / タスク一覧

tasks.md をカード形式で一覧表示する。カードにはチェックボックスで完了と、名前の変更ができる。あと、ドラッグドロップで順番移動、分類間移動ができる。do at, waitingに移動した時は、担当者と日付を入れるダイアログが移動完了直後に表示される。

Next Action トグルをonにすると、 `Next Actions` の全てと、`Do at`のうち対象日が今日であるものを、inboxと同じようにカードとして重ねてトップだけ見えるように表示する。
この時の順序は、「Do atの日付が今日であるもの」→「Next Actions」の順。

Next Action時はチェックで完了、下の方にあるボタンで最下部に移動（後回し）。

ここは1件1件時間をかけて処理するため、キー操作ではなくボタンでミスなく操作する。

### ログ鑑賞

タスク完了数を使ってgithubの草を表示する。その下に日毎の完了タスクリスト。草のマスクリックでその日のタスクリストに飛ぶ。
