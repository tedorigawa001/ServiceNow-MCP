# MA-02 V07/V08 禁止操作の試行監視・負の対照の公式機構調査

- 状態: draft-0.1 / 公式資料の文書調査 / 人の承認・実環境検証なし
- 調査日: 2026-10-24 / 基準commit: `0ff5a92`
- 親: [同一端末VM候補比較](BEST_PRACTICE_BP5_R2_OL03_MA02_SAME_HOST_VM_OFFICIAL_COMPARISON.md)、[V01〜V11の条件](BEST_PRACTICE_BP5_R2_OL03_MA02_NO_TRUST_SAME_HOST_VM_OPTIONS.md)

## 1. 結論・適用範囲

macOS guest向けには、Endpoint Security（ES）のAUTHとNetwork Extension（NE）のflow制御が、禁止操作の判断点を観測する公式機構の候補になる。ただし単独でも組合せでも、V07全域の「拒否された全試行の監査」を今回の資料だけで証明できない。**V07/V08は未適合・未検証のまま**とする。一般的なEDRと同等という主張や、導入済み製品への採用判断ではない。

対象は初期計画のmacOS arm64 guest。host側でVM processや仮想NICを観測しても、guest内のfile/exec/IPC試行の意味や主体がそのまま得られるとはしない。guest内の監視器・権限・保存先も信頼境界に追加される。Linuxの監査機構への置換は今回調査しておらず、macOSの実証にはならない。

区別する証拠は、(a) fixtureが操作を要求したこと、(b) OSの判断点で受信したこと、(c) 拒否応答が受理されたこと、(d) 操作の結果、(e) 監視の継続性。NOTIFY、非0終了、packetが無いこと、fileが変わらないことのいずれか1つだけで、全てを満たしたとしない。

## 2. 公式根拠・該当箇所

AIが調査日に確認した資料。古いWWDC/Archiveの説明はその時点の仕様であり、将来の固定OS/SDKで再確認する。APIページの一部は通常表示がJavaScript案内だけになったため、公式の検索索引に取得された本文を照合した。SDK header・実binary・署名・現在の端末設定は未照合。Community/第三者記事は根拠に採用しない。

| ID | 公式URL・該当箇所 | 確認内容と限界 |
|---|---|---|
| E1 | [AUTH_OPEN](https://developer.apple.com/documentation/endpointsecurity/es_event_type_auth_open) / [AUTH_EXEC](https://developer.apple.com/documentation/endpointsecurity/es_event_type_auth_exec) — Discussion | file open・別image実行の許可要求を表す。任意のread/write syscall全体の監査と同義ではない |
| E2 | [AUTH_UIPC_CONNECT](https://developer.apple.com/documentation/endpointsecurity/es_event_type_auth_uipc_connect) — Discussion | UNIX domain socketへのconnectを対象とし、一般のnetwork socket全体ではない |
| E3 | [ES event types](https://developer.apple.com/documentation/endpointsecurity/es_event_type_t) — Authorization / Notification Event Types | CREATE、RENAME、UNLINK、MMAP等のAUTHとWRITE等のNOTIFYを区別する。列挙の存在だけで全失敗経路の通知を保証しない |
| E4 | [Build an Endpoint Security app, WWDC20](https://developer.apple.com/videos/play/wwdc2020/10159/) — AUTH/NOTIFY、deadline、cacheの説明（約13〜21分） | AUTHは同期判断、NOTIFYは非同期。期限超過はclient終了と暗黙ALLOW、cache hitはAUTH省略、自己起因AUTHにも例外があるとの説明。OPENはflags応答を使う |
| E5 | [global_seq_num](https://developer.apple.com/documentation/endpointsecurity/es_message_t/global_seq_num) — Discussion | client内の連番差でkernelによるdropを検出。message version > 4が条件。連番正常でも未購読・mute・cache・収集前後の欠落は証明しない |
| E6 | [ES Client](https://developer.apple.com/documentation/endpointsecurity/client) — Overview / client生成のerror分類、[ES entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.endpoint-security.client) — Discussion | 従来のsystem-wide clientはroot/TCC等が必要で、entitlementはAppleへの申請が必要。承認・発行済みではない |
| E7 | [What's new in Endpoint Security, WWDC22](https://developer.apple.com/videos/play/wwdc2022/110345/) — muting / eslogger / OpenBSM | esloggerはVenturaのNOTIFYをJSON化する標準tool。root/FDAが必要で、application用ではなく出力は更新で変わり得る。OpenBSMはBig Surからdeprecatedとの説明 |
| E8 | [es_new_descendants_client](https://developer.apple.com/documentation/endpointsecurity/es_new_descendants_client(_:_:)) — Discussion / Beta Software | 子孫限定clientはroot/TCC不要、ES entitlementは必要と記載。自身はNOTIFY、作成後の子孫はAUTH/NOTIFY。Beta資料であり固定対象OSの正式利用可否は未確認、既定候補に昇格しない |
| N1 | [NEProvider](https://developer.apple.com/documentation/networkextension/neprovider) — Overview、[handleNewFlow](https://developer.apple.com/documentation/networkextension/nefilterdataprovider/handlenewflow(_:)) — Discussion | networkのdata pathへ関与し、新しいflowに判定を返す。発生しなかったflowや上流で失敗したsyscallの全試行を表すとは書かれていない |
| N2 | [Network Extensions for the Modern Mac, WWDC19](https://developer.apple.com/videos/play/wwdc2019/714/) — Content Filter / flow・packet filtering | macOSのsystem extensionでTCP/UDP flowまたはpacketのallow/dropを判断する説明。packet層のみでアプリの全要求を監査したとはしない |
| N3 | [NEDNSProxyProvider](https://developer.apple.com/documentation/networkextension/nednsproxyprovider) — Overview / [handleNewFlow](https://developer.apple.com/documentation/networkextension/nednsproxyprovider/handlenewflow(_:)) — Return Value | DNSのTCP/UDP port 53 flowを対象に扱う/終了する。resolver API全呼出し、cache hit、DoH/DoT等を網羅する根拠ではない |
| N4 | [Network Extensions Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension) — Possible Values / Developer ID配布 | content-filter、DNS proxyとsystem-extension用の値等を区別。署名/capability/配布・有効化要件の別審査が必要 |
| A1 | [Protecting user data with App Sandbox](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox) — Overview / embedded tool、[Embedding a command-line tool](https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app) — entitlement設定 | file/network等のアクセス制限とtoolのsandbox継承を説明。任意の既存GnuPGに透明に適用できる保証や、拒否logの完全性保証ではない |
| F1 | [File System Events Programming Guide](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/Introduction/Introduction.html) — Introduction（2012 Archive） | directory hierarchyの変更通知。禁止read/open失敗の完全監査を目的とした契約ではない |

E4の暗黙ALLOWは、本計画のfail-closedをOSのES任せにできない重要な制約である。独立した制限・外側監督で被害範囲を限定し、期限逸脱を検知した票は必ず不成立にする必要がある。検知後に止めても、それ以前の許可を取り消せるとはしない。

## 3. 対応範囲と残る穴

以下の「候補」は本計画上の推論であり、適合証明ではない。ES/NEの起動成功だけでは監査開始完了にならない。

| 禁止対象 | 公式機構で説明できる判断点 | 制約・未確認事項 / V07の扱い |
|---|---|---|
| 許可外fileのopen/create/rename/unlink等 | ES AUTH群（E1/E3）で受信した要求へdeny、応答結果を記録する候補 | ENOENT/EACCES等が先に発生した経路、sandbox/TCCとの順序、path alias、cache/muteを要確認。全失敗openの通知を仮定しない |
| file read/writeそのもの | openのflags制御、MMAP等の別判断点、WRITEのNOTIFY（E3/E4） | openとreadは別。継承済みFD・mmap・既存writable FDの操作まで各試行が見えるとはしない。FD非継承・入力限定等の防御も別要件 |
| child/helper/agent実行 | AUTH_EXECとfork/execの通知を組み合わせる候補（E1/E3） | exec拒否はfork自体の未発生証明ではない。posix_spawn失敗、launchd/XPC経由の別主体、PID再利用も要確認 |
| UNIX socket / gpg-agent | AUTH_UIPC_CONNECT（E2） | Mach/XPC、pipe、共有memory、継承済みsocket、既存接続のsend全体へ一般化しない。agent不在と接続試行なしは別 |
| TCP/UDP、host/外向き/loopback | NE content filterのflow判定・drop（N1/N2） | hostの仮想NICだけではguest processへ帰属不可。IPv4/IPv6・loopback・失敗前flow・routeなし・他filterとの順序・起動前既存flowは未確認 |
| DNS/名前解決 | DNS proxyでport 53 flowを受信/終了（N3） | query生成前のcache/hosts処理、system resolverへのIPC、暗号化DNS、delegateされたresolver processの帰属は未確認 |
| Mach/XPC等のIPC全般 | 今回の資料では必要な全試行をカバーする機構を確定できず | ESのUIPCを全IPCの証拠にしない。別の公式制限・観測機構が無ければUnknownで停止 |
| 監査log変更・監視器停止 | 別権限のcollectorと外側監督を設計する必要 | root監視器と非管理者試験の分離だけで改変不能としない。log/IPC endpoint/設定/監視processの保護・停止検出が未設計 |

App Sandboxは制御の補助候補で、監査器の代わりではない。既存の認証済みbinaryを再署名/再buildして継承構成に変える場合、検証器の同一性とclosure認証の再審査が必要で、今回は変更しない。sandbox違反の任意logを拾うだけで全拒否を記録したとはしない（A1）。

esloggerは公式標準toolによるNOTIFYの予備調査候補だが、AUTH deny主体でも安定したアプリ組込み契約でもない。OpenBSMはdeprecated資料だけを根拠に新規採用しない。FSEventsは変更検出の補助に限る。これらを寄せ集めても、欠けたfile read/IPC/DNS試行の証拠を補完した扱いにしない（E7/F1）。

## 4. 将来の負の対照（未実装・未実施）

[既存20ケース](BEST_PRACTICE_BP5_R2_OL03_MA02_GNUPG_BASELINE_ISOLATION_DESIGN.md)のI01/I06等を細分化する検討票であり、新しい合格実績ではない。合成fault sourceはGnuPGとは別の認証済みtest-only入力。以下を実行する許可はない。外部の実サービス・個人HOME・実秘密を宛先/入力に使わず、guest内に許可を得て用意する合成対象に限る。

| ID | 対照の案 | 必要な観測と不成立条件 |
|---|---|---|
| NC01 | 存在する合成fileへの禁止open/read要求。write/create/rename/unlinkを別操作に分ける | fixture発行記録、主体、対応判断点、deny受理、戻り値/副作用の照合。変更無しだけでは不可 |
| NC02 | ENOENT/DAC/sandbox等で拒否される要求、同一要求の反復、継承FDからの要求 | AUTH前の拒否・cache・既存FDの穴を評価。hookが見えなければ観測不能として残し、別操作の成功で代替しない |
| NC03 | 合成helperへのexec/posix_spawn、fork経路 | exec判断とprocess生成結果を区別。子孫追跡の起点前/世代違い/起動brokerも確認対象。後続が起動したら即不成立 |
| NC04 | ダミーUNIX socketと合成Mach/XPC endpointへの個別要求 | agent未接続だけでなく要求の観測が必要。UIPCだけ通ってもMach/XPCを合格にしない |
| NC05 | 合成TCP/UDP宛先へのIPv4/IPv6・loopback要求、route無しの要求 | flow到達/非到達とdeny結果を分ける。fixtureの要求をpacket logだけで数えない。遮断を解除して外部通信しない |
| NC06 | 合成名前の名前解決、cache有無、直接port 53とresolver APIを分ける | resolver要求とDNS packetは別件。queryが無い場合の理由/観測経路が不明なら不成立 |
| NC07 | 監査先の合成改変/削除、監視器停止・購読失敗・mute・cache影響のfault | 改変の拒否と監査継続性喪失を識別。heartbeatのみで欠けたイベントを補完しない |
| NC08 | queue過負荷、連番gap、AUTH期限逸脱、出力上限、末尾記録切断 | 有限上限内で停止し、先行理由と監査不完全を保持。監視器再起動後も同じ成功票を継続しない |

各ケースの期待値は「要求→判断点→deny受理→失敗結果→後続非到達」の対応に限定する。意図的な禁止要求が観測できた負の対照の成功と、通常GnuPGで禁止要求が無かったことを混同しない。試験結果の詳細は非公開、公開summaryは固定ID/reason/件数/digestに限定する。生path・argv/env・任意DNS名・UID・token・stderrは公開しない。

## 5. 監査の成立条件として別途必要な設計

1. 固定OS/build/SDK・対応event集合・監視binary/closure・policyを結合する。従来ESとBeta子孫限定APIの前提を混ぜない。署名/entitlement/FDA/有効化の承認は未取得で、今回申請しない。
2. guestの非管理者試験主体と監視主体を分離し、監視ready・購読/有効化成功より前に試験を開始しない。PIDだけでなく世代を識別するaudit token等との結合を設計する。broker経由の帰属は未解決。
3. 必要eventに対するmute/cache/購読状態を審査する。cache=falseの指定だけで全clientの共有cache問題を解消したとはしない。全体cache消去やunmuteは副作用があるため無断で行わない（E4/E7）。
4. AUTHの記録・応答は各messageの期限内でboundedに処理する。監査保存待ちが原因で期限を超えない構造、保存失敗の停止、外側制限を設計する。deny API成功だけで操作の最終失敗を推定しない。
5. kernel sequence gap、collector queue/log上限、heartbeat、終了時のdrain/末尾の証拠を分ける。連番は対象versionでのみ使用し、最終イベント以降のdropや非購読を「gapなし」で隠さない（E5）。
6. 試験終了→子孫終了確認→監査完了境界→限定結果確定という順序と、V09の終了未確認の優先理由を別設計する。監視器の再起動・期限逸脱・欠落・無許可操作はstickyな不成立とし、部分的な静かなlogを成功票にしない。

これは実装案の条件整理であり、監視機構の採用や実行許可ではない。試験processのerrno等は補助証拠で、信頼するOS側観測との不一致を上書きしない。監視対象に含まれない経路を「ゼロ件」で表示せず、未対応/未観測を明示する。

## 6. 優先度と未確認事項

- 優先1: V07の観測単位を確定する。各syscall/API試行を要するのか、OSの許可判断点を対象とするのかで要求が違う。今回要件を緩和していない。全read/名前解決/IPCを要求する現行範囲を満たす公式経路は未確定。
- 優先2: Mach/XPC、継承FD、AUTH前失敗、resolver cache/brokerの公式なcoverageを追加確認する。見つからなければ現行契約で実施不可を維持し、限定実験への変更には別承認が必要。
- 優先3: 固定guest OS候補に対するES/NEの正式API availabilityと署名/配布/有効化要件を整理する。Beta子孫限定APIや古いWWDCから可用性を推定しない。hostの権限追加でguest監査を代替しない。
- 優先4: 許可を得た将来工程でのみ、監視の負の対照・欠落/停止/拒否のoracleとI05の保存先/保持期間を確定する。信頼済み検証器不足は監視設計とは別の停止理由として残す。

公式ページの一部で本文取得制約があり、固定SDK header・対象OS実装との完全照合は未実施。各APIの全失敗順序、NEのfilter間順序/障害時挙動/loopback範囲、deny試行の永続log exportと完全性、guestでのactivation可否は未確認。本書はそれらを試験済み・承認済みにしない。

## 7. 維持する停止状態

未導出5項目はUnknown、全体受付無効、telemetry保留。APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止、完成parts/permit非発行を維持する。[チェックリスト](BEST_PRACTICE_BP5_R2_OL03_MA02_USER_INFORMATION_APPROVAL_CHECKLIST.md)はI01〜I05回答済み、E/A/T計20項目未チェックのまま。

実装・tool/monitor導入・起動・VM/OS設定変更・実機操作・鍵承認・担当者連絡は行わない。資料調査とMD更新は人の承認、V07/V08合格、D2以降の開始条件の充足ではない。
