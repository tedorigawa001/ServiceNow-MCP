# FP-3 post後受理と未公開完成bundleの内部契約

Version: br006-recovery-fp3-post-accept-bundle-draft-0.3 / Date: 2026-11-04。
設計初稿の基準HEAD: `8369094`。Status: **FP3-Aだけ合成内実装済み。FP3-B／Cは設計段階。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。完成bundle生成・seal成功・実接続・実通信・設定変更・Pushは行わない。**

FP3-A追記：[検証記録](E2E_BEST_PRACTICE_POST_PROOF_FP3A_2026-11-04.md)に、root側発行状態・post-only issuer・同partsのprivate proof pair、混入拒否・途中失敗clearを記録する。pair受理後も固定abortし、以下のready／consuming／retiredや未公開完成bundleには進まない。

draft-0.2のレビュー修正：FP3-Aのorigin台帳のparts／content／prefix照合、issuer内の発行前照合、証拠0条件、発行後のカウンタ／D2 slot条件は、外しても全試験が通過していた。compiled fixtureに、台帳だけのずれ、発行前の不整合と証拠混入（証拠数0のまま停止）、発行後のカウンタ／slotのずれを追加し、合成試験にwork失敗の暫定保持とpost停止優先を追加した。kernelの挙動は変更していない。

[full投影とbundleの親設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FULL_PROJECTION_BUNDLE_DESIGN.md)§4・6のFP-3を具体化する。目的は、FP-2のwork候補をpost後だけ受理し、同一取引の非公開bundleへ一度だけ結合・固定消費すること。未公開bundleの成立と、後続のatomic commit／利用可能destへの移譲は別工程とする。

## 1 現行境界と変更する継続

[現行kernel](../tests/support/review/synthetic-recovery-kernel.ts)のFP-2は、同full受領snapshotのexpectation・D1 draft・prefix候補をBundlePartsDraftへ結合し、workとpostで全構成を照合してから固定abortする。ContentChecked・prefix関係値・完成bundleは発行しない。

FP-3はfreshな合成constructor継続だけに接続する。FP-1・FP-2・旧header／D2入口は維持し、callerのmode指定、既存accepted／parts／証拠の登録口、payload getter、汎用callbackは追加しない。旧D2で生成後に破棄したContentCheckedや、既存consumePrefixRelationで消費済みの関係値は流用しない。

FP3-AはcheckBundlePartsの証拠0条件を保ち、共通の値・identity検査をcheckBundleCompositionへ分離した。発行前wrapperと発行後の固定proof pair検査の両方から使用する。完成bundleの発行後検査は後続工程とし、証拠0条件をcaller指定flagで外す方式にはしない。

## 2 内部保持物と発行元

PostAcceptedProofPairと発行中slotはFP3-Aで合成内実装済み。未公開完成bundle／消費中slotは未実装。BundlePartsDraftはFP-2の既存型を供給元とする。全slot・利用状態・失敗診断の所有者は、DATA検査前の同constructionで確保する。値を移動するだけで自動的に失われるboolを、再利用防止の唯一の根拠にしない。

| 内部保持物 | 発行元と結合 | 利用権限 |
| --- | --- | --- |
| BundlePartsDraft | FP-2と同じ元pending・受領物・model／rows・expectation・本文／prefix候補・予算／失効serial | post前はwork候補。単独では証拠や完成bundleにならない |
| PostAcceptedProofPair | post後の固定issuer。ContentCheckedとOrderedPrefixRelationそれぞれの元object／marker、同parts・owner・pending・受領receiptへの対応 | 同rootで一組だけ。片方だけを完成として受理しない |
| UnpublishedCompleteBundle | 同issuerが同partsと上記一組を結合。元projection／expectation・全manifest／元本文・row／receipt・prefix各laneと終端責務への結合を保持 | 同root内だけで使用。公開handle・完成成功票・commit権限を持たない |
| 発行中slot | partsと片方／両方の証拠、生成途中bundleの保護参照 | 生成例外時もclear対象。証拠の部分生成をreadyと扱わない |
| 消費中slot | 唯一のbundle slotから外して移した同bundle | 一度限りの固定検査・破棄だけ。結果としてpayloadを返さない |

同rootが実際の証拠objectとmarkerをprivateに保持する。markerの値一致・同形copy・summary・standalone helperのmatchesから、証拠やbundleを再登録できない。proof pairは同parts自体、Content候補／prefix候補自体、元header／model・同budget identity／binding serial／失効serialを共有する。

bundleは同じ元partsを保持してよい。候補への参照が残ることと、候補を再発行・再消費できる権限は別である。元候補slotを外した後は、完成bundle内の固定照合による借用だけを許す。kernel内の元受領物照合用参照も借用として維持し、take／header-full共通claimを戻さない。

## 3 root側の一度限り状態

発行と消費の状態は同root側に置き、次の一方向遷移に限定する。既存transfer開始claim・full受領claimとは別責務であり、それらを代替・再armしない。

FP3-Aで使用する状態はunused／issuing／failedだけ。proof pairの受理数は最大1として残すが、完成bundleがないためreadyには遷移せず、固定abortでfailedへ進む。停止・失効時のclearでも状態をunusedへ戻さない。

| 状態 | 固定遷移と条件 |
| --- | --- |
| unused | work中はこの状態のまま。post guard後にissuerへ入り、検査・確保より先にissuingへ移る |
| issuing | 同parts全構成・同受領物・source open／cleanup未開始を再確認し、証拠一組とbundleを生成。途中例外・停止・再入はfailedへ進む |
| ready | 最後のprivate照合を通り、同bundleが唯一の使用対象として保持された状態。destの利用可能状態ではない |
| consuming | readyから先行消費し、唯一のbundle slotを外して消費中slotへ移す。ここから再入・二度目の利用を拒否する |
| retired | 固定検査と破棄を完了。今回の合成継続は既存固定abortへ進み、成功handleを返さない |
| failed | 発行後の失効、混入・不正順序・検査／確保／guard失敗。全payloadを破棄し、unused／readyへ戻さない |

post前に停止した場合は発行数0で終える。発行状態がunusedでも、外側transfer claimは消費済みなので再開できない。readyのbundle objectや証拠があっても、同rootの状態・元slotとの対応がなければ固定consumerは拒否する。

## 4 post後の発行順序

1. 既存のpre／workで同take・同full受領物からpartsを作る。work不適合は暫定保持し、post guardの取消・期限・先行hardを優先する。
2. post guard通過後、issuerのroot状態をissuingへ先行消費する。元partsが一つ存在すること、同pending／owner／receipt、開始UTC・全deadline、budget／失効serial、source／ready／cleanupのlive条件を再検査する。証拠はまだ0のままとする。
3. 同元Content候補からContentChecked、同元prefix候補からOrderedPrefixRelationを生成する。両方の元object・marker・同partsへの対応を同rootで保持し、PostAcceptedProofPairへ結合する。片方の確保失敗でも再発行しない。
4. 同parts、同proof pair、同ownerからUnpublishedCompleteBundleを生成する。ここで許すのは未公開の確保・freezeと固定検査だけで、caller hook／await／I/Oや新しい入力取得は挟まない。回復可能な例外は全破棄へ進める。プロセス停止・OOMからの復旧保証とは区別する。
5. 全構成と証拠の同一性・root状態／serialを最後に照合し、唯一のbundle slotへ保持してreadyとする。元work／候補／expectation等の独立した利用slotは外し、残る参照は同bundleか固定照合の借用へ限定する。
6. 直ちに同rootの固定consumerへ進む。readyを外部へ返して保持させる、後で同partsを再取得する、旧rootを呼び戻す経路は設けない。

旧consumerを一度呼んで関係値を破棄した後に、同じDATAから関係値を作り直してbundleへ入れない。新しい固定constructor継続が、最初の受理点から同bundleの消費へ直接つなぐ。

## 5 bundleの全構成照合

発行前と固定消費時に、以下の責務を分けて検査する。bundle内のexpectationだけ、またはmanifestだけの一致では通さない。

- 発行元と所有権：同root token／owner object・元pending／take marker／projectionReceipt・元accepted handle・plan／handoff、元parts object、両証拠object／marker、同proof pair objectを照合する。旧D2や別rootの同形copyを拒否する。
- 受領projectionとexpectation：元snapshotを維持する。同owner／run／session／source／key／origin／budget／release／window、frame／ready／cleanup、S／O／T_i／Uと全deadlineを照合する。再投影は比較用でありoriginalを作り直さない。expectationのkind／run_status／consistency・全header・inputs／outcomesの件数と順序、receipt／accepted_outcomeの参照同一性を維持する。
- 本文と全manifest：同model／元row台帳・一般row receipt／input receipt／元accepted outcome、D1 draftのschema／ruleset／selected／P0／original_rows、全asset field／manifest／trace／kept_findingsを照合する。reviewed keep・親省略・元worker omitted・その他nonreviewed・retainedの区別を維持する。
- prefix：同元prefix計算結果と関係値の結合、P0→Pp、base、ordered final、accepted canonicalの各laneを維持する。Ppをdelta後やcanonicalの値で上書きしない。0.2／0.3・100／103・errors切詰めの既存制約を変えない。
- 動的有効性：source open／close未開始、同ready世代、同cleanup未開始・serial=0、同budget identity／binding serial、失効serial、先行hard・busy／再入poison、root発行／消費状態を確認する。

wire／実payload由来は証明しない。既存content_evidenceのoriginal_body:unknown・full_schema:unverified・wire:unverifiedを変更せず、未公開bundleを実証拠に昇格しない。

## 6 固定消費と破棄

固定consumerは外部bundleを引数に取らず、同rootのready状態をconsumingへ先行消費する。唯一のbundle slotを外して消費中slotへ移し、同じ停止／予算ownerのpre checkpoint、全構成照合、post checkpoint、最後のidentity／serial再確認の順で処理する。checkpointは既存の開始時点の全deadlineへ委譲し、残時間から別期限を生成しない。

checkpoint／照合で停止したら失効・全破棄へ進み、claimは戻さない。全部通過した場合も、今回のconsumerは同bundle・proof pair・全payload参照をretireし、固定abortへ進むだけである。payload getter、外部callbackへのborrow、PreCommitBundle／成功handleの返却、次rootへの持越しは作らない。

consumer中の一時参照もpayloadである。busy／保護scopeの終了とfinallyでの参照解放を確認するまで本文破棄証拠を発行しない。発行中・ready・消費中・両証拠・marker・元parts・受領物・expectation／manifest／元本文の全slotをclear／payloadPending／isClearedへ含める。通常のJS参照解放であり物理消去の保証ではない。

上位custodyへ移すのは同constructionのcleanup-only capsuleと固定診断だけ。bundleやpartsをcapsuleのclosureへ隠して退避しない。本文破棄確認とsource closed／cleanup confirmedを混同せず、未解決責務はUnknownのまま保持する。既存FailureOwnerのreport seal／commitは失敗診断の移譲であり、成功destのseal／commitではない。

## 7 失敗分類と診断

post停止はwork不適合より優先する。発行／消費のguardが返す取消・期限、先行hard、未知理由／throw・混入・順序違反・再入は既存の固定分類へ写像し、first hardとcleanup診断を保持する。raw例外・本文・sys_id・opaque handleは表示しない。

部分発行の件数を完成数としない。例えばContentCheckedだけ生成して次の確保が失敗した場合、試行診断は保持できるが、proof pair受理数・bundle ready数・固定消費完了数は0となる。inspectは件数・状態・有無・固定理由だけを返し、全体受付やruntime権限には使わない。

## 8 費目とUnknown

発行前／発行後のidentity・全構成照合、proof／marker／pairの確保、bundleの確保／参照保持、guardとclaim、発行途中の重複保持、消費時の再検査、失敗clear／解放を別費目として扱う。参照moveや候補の再利用も無料とはしない。小型expectationへ全reviewed本文を詰めたり、既存局所capを拡張したりしない。

元C/G/P・retry・210試行・全60秒と局所bounded制約は維持する。全work／heap・copyピーク・3round配賦・予約額・中断粒度はUnknownのままであり、未導出費目を0にして全体受付を有効化しない。

## 9 合成試験とcompiled保証

新fresh入口だけを対象に、旧FP-1／FP-2／header／D2試験と[FP-2レビュー補強](E2E_BEST_PRACTICE_BUNDLE_PARTS_FP2_2026-11-04.md)の20故障・照合除去対照を維持する。実worker／runtime・実transportは接続しない。

- parts取得のtransfer_post前とtransfer_post停止時は発行0、同partsから証拠一組・bundle一つだけを保持すること。発行後のconsumer post停止では既発行数を保持してもready利用権限は残さないこと。成功dest／seal数は0であること。
- 未開始・逆順・直接consumer・二重発行・二重消費、旧／別rootのparts／proof／marker／bundle、summary・同形copyを拒否すること。失敗後の再準備や元slot復元を許さないこと。
- Contentのみ・prefixのみ、両方生成後のbundle確保失敗、発行後失効、消費前後の取消／期限・swallowed再入で、部分成功へ進まず全破棄すること。
- opaqueの同形copyは構造差を作らずに注入する。prefixは候補・values・partsを揃えてlane値を変え、件数違反は行を追記して検査へ到達させる。早いidentity検査で止まっただけのcaseを、後段field比較の保証として数えないこと。
- 各発行中／ready／消費中／proof／marker／元payload slotのclearを一つずつ除くと、本文破棄証拠・custody移譲が止まること。故障は一時emit treeだけに入れ、runtime friendや公開hookを追加しないこと。
- 照合や状態遷移を除去した変異が対応caseで失敗すること。等価・他検査に包含される変異は理由を記録し、単なる変異件数をcoverageの根拠にしないこと。
- 配布物に新入口・型・台帳・fixtureが含まれず、固定依存／秘密非出力と旧試験を維持すること。

## 10 次の実装分割

FP3-A（合成内実装済み）はroot側発行状態・post-only issuerとprivate proof pair、FP3-B（未実装）は同partsとの未公開bundle結合・生成途中失敗clear、FP3-C（未実装）はroot側one-shot固定consumerと失効／全破棄・compiled対照へ分ける。各段階は合成内・固定abortまでとし、単独でも旧入口を変更しない。

実atomic commit・利用可能dest／seal成功と正常terminal-only接続は、[OB-03親設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB03_DESTINATION_CONTENT_DESIGN.md)の別工程に残す。本稿の受理状態・未公開bundleの成立は、それらの実装や有効化の承認ではない。
