# BP-5 R-2 OL-03：closure index・配備ファイル検証の詳細設計

Version: draft-0.5 / Date: 2026-10-19 / Status: 承認前の設計案。parser・純粋照合・FD読取部品を内部実装/合成検証。信頼済み実配備・運用は未実施。

## 1. 目的と現在の境界

[OL-01配備・台帳設計](BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md)の閉包契約を具体化する。
[外側起動設計](BEST_PRACTICE_BP5_R2_OUTER_LAUNCH_DESIGN.md)と
[OL-03合成検証記録](E2E_BEST_PRACTICE_R2_OL03_EXEC_SYNTHETIC_2026-10-19.md)を補足する。

現在の`runtime_gate`は常に92で停止する。OL-02の`InspectedRecords`は実行許可ではない。
以下は検証器全体の要求である。parser・純粋集合/binding照合だけ
[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CLOSURE_PARSER_SYNTHETIC_2026-10-19.md)に示す内部実装がある。
純粋照合の観測一覧は呼出し側のデータである。後続の[FD読取合成検証](E2E_BEST_PRACTICE_R2_OL03_DEPLOYMENT_READ_SYNTHETIC_2026-10-19.md)で
directory FD基準の読取・owner/mode/ACL/xattr・metadata/hash照合部品を追加したが、root所有の信頼済み実配備を検証済みとはしない。
closure検査だけの成功でもgateは解除しない。実署名・entitlement・reader group排他性・配備承認も別途必要。
[署名・entitlement詳細設計案](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)で、署名APIとFD/pathの結合・更新排他の限界・承認待ちpolicyを別途整理する。署名確認を実装済みとはしない。
telemetry調査は保留。本書はPDI/OAuth/token設定を変更せず、コマンド実行手順や実値入り台帳を提供しない。

## 2. 信頼の結合と閉包の範囲

信頼順序は、保護された固定activation → exact bytesのledger hash → index hash → 配備ファイルbytesとmetadata。
index単体の自己申告や、indexと同じ可変場所にある未検証hashを信頼の起点にしない。
activationとledgerのindex hashは一致を必須とする。pathはledgerからだけ取得し、argv/envで上書きしない。

runtime root配下のNode実体・entry・host・worker・checker・全JS/JSON/package.json・依存node_modulesを対象とする。
動的import/requireの候補も配備前に列挙・審査する。静的走査だけで完全な閉包を証明したとはしない。
node_modulesの親探索、root外の非system dylib、native addon、任意loader、生成コード・downloadに依存する構成は初期版では拒否する。
system frameworkは固定OS buildの信頼前提へ分離する。Nodeの組込み機能とディスク上の依存を混同しない。
launcherがroot外にある場合はledgerの別binary検証対象とし、indexによる代替はしない。
実際のNode/依存構成がこの制約を満たすかは未確認で、黙って除外を増やさない。

## 3. indexスキーマ案

UTF-8 JSON、BOMなし。未知キー・全階層の重複キー・末尾データ・不正数値・不正UTF-8を拒否。
hashは生のfile bytesのSHA-256小文字hex64桁。JSONの正規化・改行変換後のhashではない。

| キー | 型・制約 |
|---|---|
| `schema_version` | 固定文字列`bp5-r2-closure-index-0.1` |
| `release_id` | ledger/activationと完全一致する非空文字列、最大128 UTF-8 bytes、制御文字なし |
| `generation` | ledger/activationと同じ正整数、最大2^53−1 |
| `entries` | 下記entryの配列。root自身を除く全directory/fileを含む |

file entryは`path`, `kind="file"`, `mode`, `size`, `sha256`だけを持つ。
directory entryは`path`, `kind="directory"`, `mode`だけを持ち、size/hashを指定したら拒否する。
modeは文字列`"0444"`または`"0555"`。directoryは0555、通常データは0444、Node等の承認した実行fileだけ0555。
実行可否をindexの任意指定で増やさず、ledgerのNode等の固定許可対象と照合する。
全entryのownerは実測root、ACLなし、特殊permissionなし。UID/GIDの任意許可をindexに持たせない。
通常fileはlink count=1を要求し、directoryのlink countに同じ条件を適用しない。
`size`は非負の整数bytes。宣言値は実読取量の代わりにせず、overflowも拒否する。

### 3.0 拡張属性（xattr）の固定方針案

配備root・配下の全file/directory・index、および別検証対象のlauncherに適用する。
indexに任意のxattr許可リストを持たせず、検査器の固定policyとして扱う。

| 属性名 | 扱い |
|---|---|
| `com.apple.provenance` | 存在だけを許可する候補。値はopaqueなOS metadataとして扱い、内容の承認・署名・由来の真正性の証拠にはしない。存在は必須にしない |
| `com.apple.quarantine` | 存在すれば起動拒否。今回の方針ではGatekeeper評価を理由に許可へ変換しない |
| その他すべて | 拒否。`com.apple.ResourceFork`や`com.apple.FinderInfo`等も例外にしない |

quarantine拒否時に属性を削除・変更して再試行する処理や、削除を促す復旧コマンドは設けない。
OL-01の「quarantine除去を代替手段にしない」を維持する。正規配布・OS評価を含む配備方式がこの方針と両立するかは承認待ちであり、
全ての署名済み/公証済み配布物がそのまま受理されるとは主張しない。
provenanceは、2026-10-19のレビュー中にローカルで`xattr`を実行し、Node本体・`dist/review/r2-launcher-entry.js`・
`node_modules/zod/package.json`の3件で観測した。1台での観測であり、属性の自動付与・削除可否のOS仕様を独立検証したものではない。
属性なしを必須とする案を避ける一方、未知属性を一般的なOS metadataとして黙認しない。
配備rootより上のsystem祖先に同じ一覧を機械的に適用するかは別途OS適合確認を要する。祖先のowner/mode/ACL検査は引き続き必須とする。

**OL-02のactivation/ledger readerにも同じ固定policyを適用する案とする。** 実装済みのOL-02 readerは現在xattrを検査していない。
利用者が作成するledgerにもprovenanceが付く可能性が高く、対象外にするとrecordだけ未知属性（resource fork等）を黙認する不整合になる。
activation/ledgerでも受理できる名前集合は空または`{com.apple.provenance}`、quarantine・その他は拒否し、
前後のidentity照合に属性名集合を含める。値は読まず、信頼判断に使わない。OL-02 readerへの追加実装と合成試験は別承認で行い、
追加するまでrecord側のxattrは未検査であることを残余として扱う（runtime gateは閉じたまま）。

### 3.1 pathと集合

- pathはroot相対、ASCIIの限定文字集合`[A-Za-z0-9._@+/-]`だけを初期案とする。
- 先頭/末尾`/`、空component、`.`、`..`、backslash、NUL、percent解釈、絶対pathを拒否する。
- 最大4096 bytes、component最大255 bytes、深さ最大64。Unicode正規化をして許可へ変換しない。
- pathのbyte昇順を必須とし、重複・ASCII大文字小文字を無視した衝突・file/directory衝突を拒否する。
- 親directoryをすべて列挙し、欠けた親・file配下の子を拒否する。実FSのcase-insensitive aliasもidentity検査で拒否する。
- 実rootとindex集合を双方向照合し、欠落だけでなく余分なfile/directoryも拒否する。ignore/glob例外は設けない。

indexは既存ledger契約に合わせroot内の固定`runtime.index_path`に置く。
自己hashの循環を避けるため、**index自身だけ**はentriesの対象外とする。
この一箇所はledgerの固定path・hashとroot所有0444/single link/ACLなしで別検証し、列挙時にも一度だけ確認する。
activation/ledger/manifest・lock・ログ・cacheはroot外とし、indexの除外リストを増やさない。

### 3.2 上限

index最大16MiB、JSON深さ16、entry最大100,000、全file実読取合計最大2GiB（index自身も容量へ計上）。
個別fileも合計上限以下。directory列挙・検証用metadataもentry上限内でboundedに保持する。
streaming parser等の選定は別途審査し、巨大な未検証配列を先に無制限確保しない。
外側全検査で共通のmonotonic 10秒以内。fileごとの10秒へ更新しない。
期限・容量超過は停止し、部分一致を成功やpermitにしない。上限内に実閉包が収まるかは承認前に測定する。

## 4. 安全な読み込みと実体照合

1. 起動時のclock/deadlineを固定し、OL-02 recordのbindingを検査する。
2. 信頼済みrootと全祖先をcomponent単位で開く。symlinkを追わず、directory FD基準で子を解決する。
   rootはroot所有0555、非公開配備祖先は承認したroot所有0550等の固定方針と照合する。
   祖先の書込み可能component・ACL・不明metadataは拒否する。実行UID所有のruntimeを許可しない。
3. indexを通常fileとしてboundedに開き、前後のfstat・link count・owner/mode/ACL・identityを照合する。
   bytes hashをledger/activationと比較してからschema/意味検証する。path文字列だけのrealpath検査で代替しない。
4. 全directoryをbounded列挙し、正確な集合を照合する。symlink/hardlink/FIFO/socket/deviceを拒否する。
5. 各fileをdirectory FD相対で開き、open後の実体を検査する。実測sizeと読取bytesを照合し、上限付きでhashを計算する。
   前後のdevice/inode・type・size・mtime/ctime・owner/mode/ACLを比較し、途中変更は拒否する。
   同一device/inodeが異なるfile pathに現れる場合も拒否する。timestamp一致だけを不変の証拠にしない。
6. 最終的にroot/祖先/index/列挙集合・Node identityを再確認し、record・世代・期限と結合する。
   署名検証と更新排他の証拠も揃った場合だけ、非公開で偽造不能な内部permitへ進める設計とする。

### 4.1 xattrの安全な列挙と前後照合

§3.0対象は開いた同一FDに対する属性名列挙を使用し、path再解決やsymlink追従で検査対象を変えない。
属性名の生bytesを完全一致で比較し、順序だけを正規化する。別名・不正なNUL区切り・重複・不正名は拒否する。
列挙bufferは初期上限64KiB/対象、名前最大255 bytesとし、必要長のoverflow・途中増加・検査不能を拒否する案。
サイズ取得と列挙の間の競合で無制限に再試行しない。共通10秒期限とboundedなmetadata予算に含める。
受理できる名前集合は空または`{com.apple.provenance}`だけであり、provenance値の読込・公開・indexへの保存は行わない。

file hash読取前後、index読取前後、directory列挙前後と最終再検証で属性名集合を照合し、identity snapshotの一部とする。
名前の追加・削除は`changed`、初回の未許可属性はpolicy拒否とし、いずれもNode起動0回で停止する。
属性名集合だけでは許可属性の値変更や追加後削除（ABA）を完全には検出できない。provenance値を信頼判断に使わず、
他のmetadata照合・書換不能配備・寿命全体の更新排他を併用する。xattrの列挙だけを改変防止の証明にしない。

同一device内だけを初期案とし、子mount・ネットワークFS・metadataを確実に取得できないFSは拒否する。
全file FDを100,000個保持する方式は採らず、root/必要なdirectory FDとbounded metadataを利用する。
Nodeがexec/import時にpathを再解決することは残る。FDから読んだ事実だけで、その後のpathの安全を証明しない。

## 5. 更新排他と検査後の差替え

### 5.1 不変releaseと更新の区別

承認済みreleaseは通常UIDに書込み不可とし、稼働中のfile変更・rename・削除を禁止する。
更新は別rootへのstaging、全照合、別承認、新ledgerとactivation世代の切替で行う。
古いreleaseはNodeだけでなくhost/worker等の関連processがすべて終了するまで保持する。
rootによる悪意の改変やOS侵害は保証対象外だが、正規の配備作業の競合は対象内とする。

### 5.2 排他のライフサイクル要求（方式は承認待ち）

開始受付停止 → 新規検査/起動との排他取得 → 既存実行の終了確認 → 切替 → 再検証 → 受付再開。
通常起動は検査前にread leaseを取得し、最後の関連processが終わるまでreleaseの保持を保証する必要がある。
TTLだけでleaseを失効させて稼働releaseを削除しない。終了未確認は更新/削除を停止する。
stale lock、PID再利用、異常終了、配備担当の競合、更新失敗の復旧を別々に試験する。

**現在のexec部品はFD>=3を全閉鎖するため、同processのlock FDをexec越しに保持する案とは両立しない。**
lock FDだけを黙って継承する変更や、exec前にlockを解放する方式は採らない。
独立した信頼済みlease所有者がprocessライフサイクルを追跡する案、または管理担当による完全な更新停止運用を比較して承認する。
前者は追加process/IPC/権限・終了確認の設計が必要で、既存の「外側はexecするだけ」という前提への影響を審査する。
後者は機械的排他の証明ではなく運用前提であり、紙の承認票や単なるprocess一覧だけで実装済みの排他としない。
本書では方式を選定せず、排他を満たした証拠がない間はruntime gate=92を維持する。

### 5.3 直前再検証の限界

exec直前にactivation/ledgerのexact bytes・identity・世代、index/root/Node・必要な祖先と残期限450秒超を再確認する。
共通10秒期限とwall/monotonic整合も維持する。再検査のために時計をリセットしない。
read後からexecまで、さらに遅延importまでの間を再hash一回だけで保護できるとはしない。
書換不能な配備と寿命全体の更新排他が前提。競合を検出した場合は同じ呼出しで再試行せずNode起動0回で停止する。

## 6. 失敗・出力・試験計画

失敗は内部の有限理由（schema/hash/metadata/set/changed/limit/deadline等）として区別する案。
公開exit codeへの割当は後続設計で確定し、既存90〜95やentry側71/73を無断で再定義しない。
未実装gateは現行92のまま。raw errno・path・index全文・ファイルbytes・承認refを出力しない。
panic/backtrace/FFI失敗も固定非0に封じ、外部署名ツール・network・shell・自動修復を起動しない。

| 合成検証群 | 必須境界 |
|---|---|
| index | 正常最小、未知/重複キー、不正UTF-8、末尾、hash不一致、世代/release不一致、自己index除外の悪用 |
| path/集合 | traversal、大小文字衝突、親欠落、未知file、削除、symlink/hardlink、特殊file、mount境界 |
| metadata | owner/mode/ACL/特殊bit不適合、書換可能祖先、開く直前/読取途中/検査後の差替え |
| xattr | 空/provenanceだけを許可、quarantine/ResourceFork/未知属性を拒否、名前集合の追加/削除、列挙競合・過大/不正応答・取得不能を停止。値を出力しない |
| bounded | 16MiB/100,000/2GiBの境界・overflow・過少size、共通10秒と残期限境界 |
| 排他 | 更新と起動の競合、exec後遅延import中の保持、異常終了・終了未確認・PID再利用・切替失敗 |
| 停止/秘密 | 全拒否でNode0回、raw値/marker非出力、公開gate迂回不能、既存FD/終了code契約との両立 |

fixtureは架空bytesと一時領域を使う。実root所有配備・署名済み成果物・PDIは合成テストの代用品として用意しない。
privileged metadata/leaseのfake成功をOSでの保証と呼ばず、OS境界の別検証を残す。

## 7. 承認待ち事項と実装順

1. **前提承認**：初期macOS/FS/Node/toolchain、署名者・Node entitlement集合、配備担当と信頼元。
2. **契約承認**：ASCII path制約、mode/owner方針、index自身の唯一の除外、閉包に含める動的依存、容量上限。xattrはprovenanceだけ許可・quarantineを含む他属性拒否の案、system祖先への適用範囲、列挙上限と正規配布との両立も承認待ち。
3. **先行実装済みの部分**：strict bounded index parserと純粋な集合/binding照合、合成テスト。観測値のOS上の真正性は未確認。permitは発行しない。
4. **読取部品を内部実装済み**：directory FD基準のfile読取とmetadata/hash照合。通常UIDの一時fixtureと合成metadataを分けて検証した。root所有正常配備・不適合ACLの実付与・実署名・更新排他の検証は未完了。
5. **排他の採択**：外部lease所有方式か運用freezeか、FD閉鎖/execモデルへの影響、終了確認・復旧責任。
6. **統合承認**：実署名・group排他・直前再検証・全体deadlineを接続した後でのみgate解除を検討。

正確な入手元/署名API・配布ticketのオフライン照合条件は既存OL-01の未確認事項を引き継ぐ。
本書は新たな公式仕様確認の記録ではなく、既存設計と現在のコードを基にしたプロジェクト要件案である。
人の承認・閉包の実測・更新排他・署名/配備検証は未実施。後続実装や実PDI開始の許可を意味しない。
