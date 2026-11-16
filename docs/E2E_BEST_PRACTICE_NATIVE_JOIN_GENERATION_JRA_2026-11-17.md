# JR-A JoinRuntime型・固定slot・生成claimの検証記録

Date: 2026-11-17。基準HEAD: `b770e59`。設計：[JoinRuntime段階型・生成資格 draft-0.2](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JOIN_RUNTIME_GENERATION_DESIGN.md#12-jr-aの限定実装)。

## 限定実装と所有境界

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のRecoveryAnchorへrun／cleanup各1個のRoleGenerationSlotをCP00で先行保持した。roleはreadonly、empty／claimed_unheld／failed_retainedを別variantとし、claim・最後の位置・先行faultを有限fieldへ保持する。pending／published、旧runPending／cleanupPendingはliteral nullである。runtime、Promise、settler、観測ackは作らない。

JoinIdentityとJoinRuntimeは旧root内だけの型で、run／cleanupのcontext・結果・settlerを分ける。runのrejectのみ捕捉した途中形、captured、unknown candidate保持、checked／published、failed_retainedを区別する。後段の値検査に成功してもauthorityにはならず、native Promiseの由来・同resource・cleanup完了を証明しない。JR-Bの実参照検査を代替しない。

private生成継続はcanonical anchor／slot／root／seedを最初に比較し、未知参照のfieldを読まない。runは構築readyだけでなく既存started／revoked／primary／sealedと未使用slotを検査し、元started→claim→position→phaseの同期群だけを進める。cleanupは保持済みcurrent recordとanchorの実参照・同binding・元started・ready・未sealed・未使用slotを検査する。先行HTTP理由・revokedだけでは同recordのread-only資格を拒否しない。

拒否は自ownerのslot faultを先に保持し、元rootのprimaryを上書きせず同期revokedにする。claim・positionを戻さず、再生成しない。通知・upper reject／stop・Promise終端はまだ接続せず、公開診断の封印やCP failure copyで代替しない。未知の解放責務はUnknownのまま保持する。

legacy execute／cleanから新継続を呼ばず、製品側の新entry・friend・callback・installer・登録口はない。[source試験](../tests/review/native-join-generation.test.ts)と[oracle](../tests/review/fixtures/native-join-generation-model.mjs)だけが、出力JSから同private区間をscratchへ抽出して呼ぶ。fake recordは試験closureで作り、製品へrecordを採用する口を追加しない。この別assembly保証を実resource所有の保証へ昇格しない。

## 独立対照

| 対照 | 確認した範囲 |
|---|---|
| 固定slot・資格拒否27 | run正常claim、二重開始、ready不成立、開始済み、revoked／sealed／先行理由、slot不整合、失敗後の条件復元でも再利用拒否、停止下cleanup正対照、cleanup重複・同binding拒否 |
| 同一性拒否32 | runのslot／root／seedとcleanupのslot／root／seed／record／anchorごとにforeign・同値copy・hook付きProxy・revoked Proxyを拒否。hook 0、foreign flags／slot／upper不変 |
| phase値121 | role別合法prefix、run半pair、cleanup reject禁止、dispatch／entry拒否、prefix不整合、欠けたsettler／work／ack、未知phase／executor／faultを値だけで検査 |
| 構文正常な変異11 | owner検査、ready／revoked／primary、claim／started、先行fault、record同一性、停止下cleanupの誤拒否、sealed、phaseのdispatch検査を弱めた変異を独立oracleが拒否 |
| semantic正負対照 | building／run半pairの正対照。同role slot、run context、null published、readonly role、cleanup reject、checked prefix、必要reject、empty時claimedの8不正を型検査で拒否。全診断を該当行へ限定 |
| 閉鎖・非実行 | new／await、Promise／enqueue／timer／clock／budget／bridge／native等を抽出区間で拒否。禁止依存のthrow stub未呼出し。製品から生成継続へのcall 0、4method維持、追加raw fieldを拒否 |

件数の単位は異なるため足し合わせない。sourceの新12件には上表のoracle呼出しが含まれる。旧試験・補強3件の成功を新claimの証明へ加算しない。11変異は有限対照で、全ての不正な実装を検出する保証ではない。

## 初回失敗と試験設計の修正

| 段階 | 原因・対応 |
|---|---|
| 初回source | 新12件中10成功／2失敗。startedの変異anchorがsource形式の空白に依存し、出力JSでは一意な指定にならずdrift拒否。statement間の空白だけを許す一意なpatternへ限定した |
| 同初回のsemantic | 同じ巨大moduleを8回Program構築し、当該caseが元5秒を超過。全体13.62秒、exit 1。製品遅延ではなく試験内の反復費だった。初めに2 Programへ集約して12件成功、その後、正対照と独立blockの全不正を1 Programで検査する構成へ削減した。期限は変更していない |
| 手動の公開面確認 | function exportだけを数える仮のregexがre-exportを除外し、3≠4でexit 1。新旧の内容比較は一致。全export statementをASTで数え直し、既存3 function＋1 re-exportの4件一致を確認した。製品・期待exportは変更していない |

初回drift／手動確認の失敗を、oracleが変異を拒否した成功数へ含めない。試験反復を減らした最終入力で関連群を再実行し、5秒と既定並列度を維持した。

## 最終検証

すべて`bdo`経由、worktreeで実施。indexのみの別展開ではない。build／Vitest／package設定、依存、旧試験は変更していない。

| 検査 | 結果 |
|---|---|
| `npm run build`／`npm run type-check` | exit 0。既存tsconfigを使用 |
| 変更TS 2本・新MJS 2本のESLint | exit 0。全repository lintではない |
| 関連source 9file | 244件成功・exit 0。最終6.75秒（群全体）、個別5秒・既定並列度は変更なし。旧232件＋新12件 |
| [新compiled](../tests/review/fixtures/compiled-native-join-generation.mjs) | 固定distのみ。資格27・同一性32／hook 0・phase 121・11変異、private宣言非漏出が成功。Promise生成／private公開／dispatch 0 |
| 既存compiled 7本 | CP00〜05、空準備、VK01／02、BG01、旧ND-01／02／03がすべてexit 0。各直接実行は外側60秒内で終了、signalなし |
| 新MJS 2本の構文 | exit 0 |
| 旧本文・公開面の構文照合 | 基準HEADと同owner／stop／fail／sample／observe／wait／clean／eligible／guard／consume／issue／snapshot／execute／closeの14本文が一致。4export statementも一致 |
| offline梱包dry-run | ignore-scripts／offline。441file・436 runtime artifact。旧root群・試験非同梱、runtime内の新private継続2名とmodel参照0。実tarball生成／展開は未実施 |
| 文書・差分静的確認 | 設計3文書と本記録のlocal link 33件・表24個に欠落／列ずれ0、末尾改行・差分空白に問題なし。既存補強試験の内容hashはHEADと一致。stageなし |

新compiledはsourceやTypeScriptへfallbackしない。既存compiledのnative操作は注入resource上の合成操作であり、実transport／通信／実機への接続ではない。新claimのsource／compiled対照と、旧実class fake試験は別保証である。

## 未接続・残課題

JR-Bの同P／settler・candidate／work・有限な拒否観測・失敗終端、JR-Cのprivate公開／最終post、legacy採用／同work統一・dispatch／entryは未接続。正規published cleanupへの再合流もJR-Aでは実装しない。既存execute／cleanは旧workのままで、新slotは通常経路中も未消費である。

Promise内部・native内部の実容量、OOM／process障害時の完全回収、未確認workの終端、外側custody／最終discardはUnknown。全体回帰・実tarball展開・新LM03／friend撤去・AP承認は未実施である。

正式発行口／C実行入口／body起動は閉鎖、全体受付無効、通常経路未切替、LOAD6／LOAD7選択・AP01〜06未承認、VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・コミット・Pushは行っていない。

## コミット前の対象限定再検証 2026年11月17日

JR-Aに関係する9fileだけをstageし、index全体を別の空directoryへ展開した。既存dist・`.git`・未登録の作業fileは持ち込まず、導入済み依存だけを参照した。build・型検査・変更TS／MJS計4fileのlintはexit 0、関連9file・244件が成功（群全体3.62秒）。個別5秒・既定並列度を維持した。

新JR-Aと既存CP00〜05／空準備／VK01・02／BG01／旧ND-01・02・03のcompiled計8本は、展開先で生成した固定distを用いてすべてexit 0・signalなしで終了した。各外側60秒は延長せず、新MJS 2本の構文もexit 0。offline・ignore-scriptsの梱包dry-runは441file・436 runtime artifactで、旧root群・試験の非同梱と新private継続／modelのruntime参照0を確認した。実tarball展開・全体回帰は未実施のままである。

再検証後の追加は本節だけで、ソース・試験入力・設定は変更しない。最終indexと展開先の一致、対象9file、文書link／表・差分空白を再確認してからコミットする。Promise生成・private公開・dispatch未接続、各閉鎖条件・Unknown・調査保留は維持し、Pushは行わない。
