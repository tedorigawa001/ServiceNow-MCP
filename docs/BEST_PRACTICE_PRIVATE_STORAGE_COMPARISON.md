# 非公開本試行48件：保管先候補の公式資料比較

Version: private-storage-comparison-0.1 / 調査日: 2026-10-17。
Status: **文献比較案。契約・テナント・実アカウント・ログ・権限の実測は未確認。採用未決定**。
ケース作成・領域設定・購入・参加者招待は行っていない。人の承認・本試行も未実施。
[保管・権限設計](BEST_PRACTICE_PRIVATE_TRIAL_STORAGE_DESIGN.md)を満たす候補を調べる資料であり、
公式機能の存在だけで開始ゲートを通過したとはしない。

## 1. 読み方・比較基準

対象はSharePoint Online＋Microsoft Purview、Google Workspace共有ドライブ、Boxの3候補。
公式の技術文書・ライセンス表を利用し、Community・販売代理店の記事は根拠に採用しない。
出典IDと該当節は§6。製品の事実と本プロジェクトの構成案/推論を分ける。
価格・税・最低契約期間・既存契約・日本での提供条件は未調査で、購入や最安プランの断定はしない。
文献は可変ページであり契約書の代わりではない。選定時に再照合する。

必要条件は、(1)C/A/R1/R2/J/Oの段階別分離、(2)主体・対象・時刻を追える閲覧/取得ログ、
(3)提出者が初回提出票を変更/削除できない受領・凍結、の3点。
**一般の編集ロック、版履歴、retention（保持）は同じ機能ではない。**
本設計が求める最低限は提出者の変更防止と原版の保存。管理者にも解除不能なWORM等は追加要件として別判断する。

## 2. 比較要約

| 観点 | SharePoint Online＋Purview | Google Workspace共有ドライブ | Box |
|---|---|---|---|
| 役割分離の基礎 | サイト/ライブラリ/項目の固有権限と継承解除（M1） | Manager等の役割、限定アクセスフォルダー（G1）。全員を同じ共有ドライブに所属させるだけでは不十分 | フォルダー単位コラボレーター。親から子へwaterfall継承（B1/B2） |
| 読取/取得の文献上のログ | FileAccessed/FilePreviewed/FileDownloaded等（M2） | View/Download/Item content accessed等（G2） | User Activity ReportのPreviewed/Downloaded等（B3/B4） |
| 注意点 | FileAccessedは同じ人・同じファイルへの再アクセスを5分間再記録しない（M2） | API・キャッシュ・プレビュー等でイベント名や記録有無が異なる（G2） | CSV反映は最大1日遅れる場合。フォルダー絞り込みは下位階層を含まない（B4） |
| 基本凍結の構成案 | C管理の別受領ライブラリへ版を保存、提出者の編集/削除権限なし | C管理の別受領領域へ版を保存、提出者はViewer以下 | C所有の別受領フォルダーへ版を保存、提出者はViewer以下 |
| 追加の保全機能 | Records Managementのlocked record/regulatory record（M5）。ライセンス/解除条件に注意 | Approvalのロックは編集者が解除でき、単独で提出凍結にならない（G5） | 通常ロックはEditor等が解除可能（B5）。Governance保持だけで編集禁止とは断定しない |
| 文献段階での採否 | 条件付き候補 | 条件付き候補 | 条件付き候補 |

「別受領領域」案はいずれも設計上の推論。コピーで権限を継承/保持する挙動、作成者/所有者、
同期/オフライン経路、共有の残存、C自身の特権を検証しない限り採用済みにはしない。

## 3. 必要な契約・管理権限の切り分け

### 3.1. Microsoft 365 / SharePoint Online

- **基本監査**：M3のAudit (Standard)表はMicrosoft 365 Business Basic/Standard/Premium、
  Microsoft 365 E3等を対象としている。SharePointの閲覧ログ取得だけを理由にE5必須とはしない。
  基本候補はSharePointを利用する契約＋Audit (Standard)の利用権。既存割当は未確認。
- **保持**：M4ではStandardの既定ログ保持は180日。対象ユーザーの適切なE5/Purview Suite等の
  ライセンスがある場合にSharePoint等の1年保持が適用され、ゲスト/非該当ユーザーは別扱い。
  管理者1人に上位プランがあるだけで全参加者の1年保持を保証しない。
- **監査参照権限**：M6のAudit Logs/View-Only Audit Logs、Audit Reader/Audit Manager等と、
  ファイルの読取/管理権限は別に割り当てる。記録有効化、検索/CSV/API利用、実際の遅延を要確認。
- **強い保全**：record/regulatory recordを使う場合はM3のLicensing for retention labelsにある
  Microsoft 365 E5、Office 365 E5、Purview Suite、E5 Information Protection and Governance等の
  該当利用権を別途照合。E3の通常retentionをrecordロックと同一視しない。
  ベース契約・対象者への割当・アドオンの適格性は契約担当による確認が必要。

構成案：Cを管理者、各人は自分の作業領域だけ編集。R1/R2をgoldの親サイトグループに入れない。
受領後は提出者の権限なし/読取だけの別領域でCが版/ハッシュを確定する。
M5の通常locked recordもメタデータ編集や管理者によるラベル解除等の条件がある。
regulatory recordは不可逆な制約があるため、この試行のために自動採用・有効化しない。

未確認：ゲストの監査主体解決、R1/R2/Jの実効ACL、同期/APIのログ、重複抑制を含む記録粒度の許容、
保持と削除期限の整合、提出後のコピー/元版/メタデータ編集、管理者操作の監査。

### 3.2. Google Workspace

- **基本機能**：G3のBusiness比較表はBusiness Starter/Standard/PlusにDrive log eventsと
  共有ドライブを掲載し、登録/ドメイン確認の脚注がある。高度な共有・アクセス制御はStandard/Plusに掲載。
  このため構成検討の起点は**Business Standard以上**とする案。これは全要件の最小契約を証明した結果ではない。
- **高度な調査**：G2のSecurity investigation toolはEnterprise Standard/Plus等の対象機能。
  基本のAudit and investigation toolとは別で、閲覧イベントを調べるだけでEnterprise必須とはしない。
- **権限/保持**：G2のAudit & Investigation管理権限が必要。イベントの大半は所有者側の対応editionに
  条件がある。G4のDriveログ保持は6か月。ファイルのVault保持で監査ログも延長されるとはしない。
- **Approval**：G3のBusiness比較表はStandard/Plusに掲載する一方、G5の取得時の利用対象説明は
  Enterprise/Education Plusに限定した表記で一致しなかった。利用可能な最小契約は**未確認**とし、
  テナントと公式サポートで確認する。いずれにせよ解除可能な編集ロックを凍結の前提にしない。

構成案：役割別の共有ドライブ/領域を分けるか、検証済みの限定アクセスを使う。
R1/R2を共通親の広いメンバー権限に入れない。Contributorは編集可能なので提出後の凍結役にはしない。
Cの受領領域へ版を確定し、提出者の編集権限を残さない（G1）。
プレビューがDownloadとして記録されたり、APIがItem content accessedになるため、Viewだけ検索しない（G2）。

未確認：所有者/外部採点者のedition条件、限定アクセスの契約/実効権限、リンク再共有、匿名主体、
MD/JSON/PDF等の実ファイル形式でのイベント、オフライン/Takeout/APIの不足経路と禁止策、
ログ保存/検索上限とエクスポートの権限、Cコピー後の所有者・履歴・変更拒否。

### 3.3. Box

- **基本監査**：B3はReportsを**Business以上**とし、Adminまたは必要権限のあるCo-adminが実行。
  B4はPreviewed/Downloaded等を列挙する。Admin Consoleが見えることだけでReports利用権を判定しない。
- **役割**：B2ではViewer/Editor以外の追加フォルダー役割はBusiness/Enterpriseで管理者が有効化。
  単一ファイルはEditor/Viewerのみ。最初の候補はBusiness以上＋利用する役割/管理機能の実契約確認。
- **保持/出力**：B3/B4は最大7年またはreporting付き契約期間に依存。1年超の結果はエクスポートが必要。
  B4のCSV最大1日遅延・階層フィルター範囲を考慮し、直後の空ログを未閲覧の証拠にしない。
- **追加保全**：Box Governanceは別の機能/契約として扱う。B6でEnterprise Plusへの同梱を確認できるが、
  他プランのアドオン可否/契約条件は要照合。保持はファイル版の保全であり、提出後の編集禁止が
  全経路で成り立つかは未確認。通常ロックだけを使う案は不採用（B5）。

構成案：C所有の親を全員へ共有せず、役割別の独立フォルダーを共有する。
B1のwaterfallにより親の権限を子だけで弱める設計に依存しない。
R1/R2は自分の作業領域で編集し、別のC受領領域ではViewer以下にする。
レポートが生成されるBox Reports領域もCだけに限定する案。

未確認：実契約のレポート範囲/Co-admin権限、外部ユーザーの主体/料金/制約、MD/JSON等のプレビュー可否、
API/Drive経路のログ、子階層を含む取得方法、コピー後の所有者/共有、凍結版の削除/再アップロード拒否、
Governanceの利用権・管理者操作・保持期間と原版保全の対応。

## 4. 選定判断案（製品採用の承認ではない）

まず既存契約と管理担当者を確認する。今回の文献だけでは最終採用先を決めない。
追加契約を先に買うのではなく、必要期間・対象経路・原版保全の強さをCが定義する。

| 条件 | 次の候補判断 |
|---|---|
| 既存M365で監査参照権限を得られる | SharePoint＋Standard監査＋C受領版を先に机上照合。必要なら保持/record利用権を追加検討 |
| 既存Box Business以上とAdmin/Co-adminがある | Boxの役割別フォルダー＋User Activity Report＋C受領版を机上照合 |
| Google Workspaceが既存基盤 | Standard以上を起点に、G2の非記録経路を許容/禁止できるかを先に確認 |
| 管理者にも変更不能な原版が必須 | 基本ACL案を採用せず、records/WORM等の別仕様・契約・実証を先に詰める |
| 全読取を1操作ずつ完全に記録する必要がある | 上記ログの抑制/欠落があるため、3候補とも文献だけでは合格としない。要件変更はCの明示承認が必要 |

これは既存資産を優先する設計上の順序案で、ベンダーの優劣を点数化したものではない。
48件は非公開で、22件の公開校正・この公開比較文書とは別権限領域に置く。

## 5. 次に埋める選定票（空票・設定前）

| 項目 | 状態 |
|---|---|
| 候補・テナント/管理担当の私有参照 | 未記入 |
| 契約SKU、参加者/所有者/管理者の割当、追加機能の利用権 | 未確認 |
| C/A/R1/R2/J/Oの実効ACL・継承・共有・管理特権 | 未検証 |
| 必要イベント・対象形式・経路・主体/対象/時刻・欠落/重複抑制の許容 | 未承認 |
| 実ログの保持・最大遅延・検索/CSV/API・保存先/閲覧者 | 未検証 |
| 提出原版の受領・版/ハッシュ・提出者の変更/削除拒否・管理者特権 | 未検証 |
| 契約費用・最低人数・日本提供・個人情報/データ所在地・保持/削除 | 未確認 |
| 無害な文書によるアクセス試験を行う別途の許可 | 未取得 |
| Cの採用/開始承認と未解決事項 | 未承認 |

本書は無害なテスト文書も作成せず、管理コンソールへアクセスしない。
次工程も契約・権限の確認までは机上作業とし、設定/試験/作問には別途依頼が必要。

## 6. 根拠台帳（全件：AIによる2026-10-17の読み取り、人の採用承認は未実施）

| ID | 公式URL | 該当箇所 |
|---|---|---|
| M1 | [SharePoint permission levels](https://learn.microsoft.com/en-us/sharepoint/understanding-permission-levels) | Inheritance、permission levels |
| M2 | [Audit log activities](https://learn.microsoft.com/en-gb/purview/audit-log-activities?view=o365-worldwide) | File and page activities：FileAccessed、FilePreviewed、FileDownloadedと再記録抑制 |
| M3 | [Purview service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/microsoft-365-service-descriptions/microsoft-365-tenantlevel-services-licensing-guidance/microsoft-purview-service-description) | Which users need a license、Audit Standard/Premium、Licensing for retention labels |
| M4 | [Audit log retention policies](https://learn.microsoft.com/purview/audit-log-retention-policies) | Default audit log retention policy、Before you create a policy |
| M5 | [Records management](https://learn.microsoft.com/en-us/purview/records-management?view=o365-worldwide) | Compare restrictions for what actions are allowed or blocked、脚注 |
| M6 | [Audit search permissions](https://learn.microsoft.com/en-us/purview/audit-troubleshooting-scenarios?view=o365-worldwide) | Permissions required to use the audit log search tool |
| G1 | [Shared drive file access](https://support.google.com/a/users/answer/12380484?hl=en) | Member permissions、Access control、limited-access folders |
| G2 | [Drive log events](https://knowledge.workspace.google.com/admin/reports/drive-log-events) | Run a search、Logged and unlogged events：Download/View/Item content accessed、管理権限 |
| G3 | [Compare Business editions](https://knowledge.workspace.google.com/admin/getting-started/editions/compare-business-editions) | Log events、Drive and Docs、脚注 |
| G4 | [Data retention and lag times](https://knowledge.workspace.google.com/admin/reports/data-retention-and-lag-times) | Data retention：Drive log events |
| G5 | [Get approvals on files](https://support.google.com/drive/answer/9387535?hl=en-to) | 利用対象Note、Unlock a file to edit |
| B1 | [Box item permissions](https://support.box.com/hc/en-us/articles/360043697254-Understanding-Item-Permissions) | waterfall permissions |
| B2 | [Box collaborator levels](https://support.box.com/hc/en-us/articles/360044196413-Understanding-Collaborator-Permission-Levels) | Feature availability by plan、Permissions by role |
| B3 | [Box reports](https://support.box.com/hc/en-us/articles/4415010860435-Using-Reports) | Business以上、Admin/Co-admin、reporting期間 |
| B4 | [Box User Activity Report](https://support.box.com/hc/en-us/articles/4415012490387-User-Activity-Report) | Notes、File Management、User Activity report filters |
| B5 | [Box lock/unlock](https://support.box.com/hc/en-us/articles/360043697174-Locking-Unlocking-Files) | 他の利用者によるロック解除 |
| B6 | [Box日本公式プラン説明](https://japan.box.com/function/box-edition) | Enterprise PlusとGovernance等の同梱説明 |

原文を大量保存せず独自要約とURL/節を記録した。固定スナップショット・契約適用・機能実測は未確認。
