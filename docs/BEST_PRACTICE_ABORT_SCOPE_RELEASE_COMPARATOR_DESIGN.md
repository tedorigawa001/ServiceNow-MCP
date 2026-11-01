# AU-BR-006／EF-03B：release純粋比較器の詳細設計

Version: br006-release-comparator-draft-0.4 / Date: 2026-11-01。
Status: **RC-01の構造入力・型・family境界に加え、RC-02のpolicy整合・優先順・limitations・非実行draft生成を純粋値として実装。実sourceへの採用は未実装。実Permit発行・friend撤去・実接続の承認ではない。旧試験、正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実通信・実機操作・設定変更・Pushは行わない。**

基準：設計は`183b540`、RC-01実装前は`39a3225`、RC-02実装前は`439c4ec`。[旧case対応表](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md)のACK-08〜16等と、[移行設計](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_MIGRATION_B02_DESIGN.md)の残差を具体化する。§11／12の実装記録と、未接続の生成owner／実source採用手順の案を区別する。

## 1 現行の責務と分離先

根拠は[BoundedUpdateSetSourceの#observeRelease／#completeRelease](../src/review/bounded-source.ts)、[設定のpin](../src/servicenow/review-release-config.ts)、[ReleaseEvidence契約](../src/review/result-schema-v2.ts)、[catalog family判定](../src/review/catalog.ts)。公式ServiceNowの新しい制約を調査した文書ではなく、現行リポジトリ内の意味を保存する設計である。

| 責務 | 純粋比較器へ移す候補 | source／生成ownerに残すもの |
|---|---|---|
| family | canonical familyへの正規化、matched／mismatched／unknownの値判定 | 取得元が同session／sourceである証拠、認証・ReleasePermit |
| 観測 | 正規化された行の空／不完全／21行sentinel／競合判定 | 固定GET、status、bytes／JSON、受信量、retry、cleanup、観測の取得時刻 |
| 設定 | pin済みprojectionの整合検査、固定run開始時刻でのissue照合、実測との値比較 | 設定file安全読取、raw configのpin・hash、接続先bindingの生成、provider実行・権限 |
| 結果 | evidence値・release_match・固定limitationsのreadonly draft | 同sourceへの採用claim、停止確認、実snapshot／release port／permit生成・登録 |

比較器は同期・決定的で、I/O・Date.now／new Dateによる現在時刻取得・timer・cryptoによる新binding生成・session登録・台帳・callback・Promiseを持たない。同じ固定入力なら同じ値を返す。ISO文字列の検査／Date.parseは入力値の演算として許容する。

配置案は`src/servicenow/review-kernel/release-comparison.ts`。runtime root／BoundedReadError／source classをimportしない。familyの単一定義を共有する場合も純粋な値moduleに限定し、result-schema全体からsourceやengineへの推移依存を増やさない。family定義の移設は別の最小差分としてレビューし、既存catalog関数の公開意味を変えない。

## 2 比較器の入力契約案

`ReleaseComparisonInput`は次のdata-only値を持つ。unknown key・accessor・proxy・特殊prototype・可変buffer・関数・Promise・live session／source／permitは拒否する。各fieldをdescriptorから一度だけ取り、必要な値を新規copyへ固定する。型だけで信頼を付与しない。

| field | 内容・有限上限 |
|---|---|
| `model_id` | 固定`release-comparison-v1`。呼出し側がcatalog対象familyを任意指定するfieldは持たない |
| `timing` | 元runの`started_at`、`deadline_ms`（1〜60,000）、complete_200のときだけownerが採取した`observed_at`。他2tagではobserved_atを持たない。ISO日時・有限epochと加算可能範囲を確認。長さの互換条件は次段落参照 |
| `policy` | pin済みの`instanceBinding`（64桁lowercase hex）、任意の`assertion`、任意の`issue`。raw config・origin URL・instance_id・provider・evidence_referenceは受けない |
| `assertion` | 既存OperatorReleaseAssertionの値だけ。source／resolution_status／visibility_scopeは固定、familyはcanonical enum、binding／config_versionは64桁、asserted_at／expires_atはISO日時 |
| `observation` | 下表のunion。生HTTP Response、公開診断copy、任意のrelease_match／family申告は受けない |

| observation.kind | 値と前提 |
|---|---|
| `complete_200` | 完了した200の値観測。`rows`は最大21件、各行は厳密な`{build_name: string（最大40文字）またはnull}`。余剰node列は既存projectionで捨てる。親／source同一性はownerの責務 |
| `invalid_observation` | 許された呼出し境界で観測envelope／行projectionが不正だった固定事実。行／例外本文・raw bytesを持たない。任意のtransport失敗をこのtagへ畳み込まない |
| `not_requested` | binding不一致でGETを開始しなかった場合だけ。policyがbinding不一致でなければ入力矛盾として拒否する |

最大21行はsentinelを含む入力枠であり、正常なfamily確定に使う観測は最大20行。行は最大21、unique familyは最大5、limitationsは最大5とし、可変長traceを追加しない。実byte layout・Rust work・全体必要量への導出は未実施でUnknownを維持する。

owner生成のstarted_at／observed_atは現行toISOStringの形を対象に最大40文字とする案。一方、既存設定schemaのasserted_at／expires_atには明示的なmax lengthがないため、同じ40文字上限を無断適用すると互換性が変わり得る。assertion日時の有限上限と既存の長い小数秒表現の扱いは**実装前の承認待ち**とする。初回合成subsetに上限を置いても、それを本番policyの新拒否条件へ黙って接続せず、元の文字列を勝手に再整形しない。

### policy整合の確認

生成ownerは既存`pinReviewReleaseConfig`の値を渡す。比較器も固定started_at／deadline_msからissueの自己整合を確認する。instanceBindingやconfig_versionが正しい設定由来であることを、64桁の形だけから証明するものではない。

1. assertionなしならissueもなし。assertionの未知family、未来asserted_at、expires_at≦asserted_at等は不正入力で、通常のrelease unknownと混同しない。既存raw設定の失敗はownerが従来どおり`config_invalid`として取得前に止める。
2. assertionのbinding≠instanceBindingなら`config_binding_mismatch`を最優先する。
3. それ以外でexpires_at≦started_atなら`config_expired`。
4. それ以外でexpires_at≦started_at＋deadline_msなら`config_validity_insufficient`。等号は不十分、1msでも超えればこの条件では有効。
5. 上記から得るissueとpin済みissueが一致しなければ、矛盾した引数として拒否する。issueを削除した値の採用や、比較時の残時間で期限を延ばすことをしない。

期限判定はended_atでも現在時刻でもなく、元runの開始＋全予算で固定する。observed_atは取得後のowner提供値をそのまま使い、比較器が新しい壁時計を生成しない。現行コードが明示していないobserved_at≧started_atという新しい制約を無断追加しない。壁時計逆行時の上位契約との整合は未確認事項として残す。

## 3 出力契約案：値draftだけ

`ReleaseComparisonResult`は、正常な値判定と不正な比較器引数を分ける。

- 成功：`ok:true`、固定`kind:release_comparison_draft`、`model_id`、`decision:{release_match, instance_release, limitations}`。instance_releaseは既存ReleaseEvidenceと同じ値形、limitationsは固定順のreadonly文字列配列。全階層をfresh copy／freezeする。
- 拒否：`ok:false`、固定`code:invalid_input`だけ。例外本文・raw値・内部参照は返さない。これはsourceが観測から正常にunknownを得た結果とは異なる。
- 成功draftの権限は常にfalse：`formal_issuance`、`release_permit`、`dispatch`、`fallback_activation`。拒否は上記の固定2fieldだけで権限fieldを返さない。どちらも`permit` property・source／lease／owner／consumer・採用用tokenを持たない。

matchedを返してもReleasePermitではない。matchedならpermitが必須となる既存ReleaseDecision型を流用せず、別の値型にする。公開draftやそのJSON／copyを実sourceが採用する入口を作らない。

pure draftのdeep freezeを、既存ReleaseDecisionの公開互換性へそのまま広げない。現行のsource-release-binding試験は公開instance_releaseのraw_buildnameを書き換えてもprivate snapshotが不変であることを確認している。将来の実source接続では、pure値・private snapshot・既存公開decisionのcopyを分け、その旧試験がthrowするような凍結強化を本移行へ混ぜない。

比較器内のordinary unknown／mismatchedは例外にしない。既存`source.resolveRelease()`はその値を返すが、bootstrapのprepared要求はmatchedでなければ`release_not_admitted`へ止める。この二段の意味を維持し、比較器のok=trueをレビュー開始可能と解釈しない。

## 4 familyの意味

canonical familyは現行の5つ：Australia、Brazil、Zurich、Yokohama、Xanadu。観測stringはJavaScriptのtrimと大小文字非区別による**family全体の一致**だけを認める。`Australia Patch 1`などからの推測・接頭辞一致・バージョン文字列の新解釈はしない。設定familyはpin済みcanonical値であり、raw設定の誤字を観測の正規化で救済しない。

| 値 | family確定時のrelease_match |
|---|---|
| Australia | matched |
| 他の既知4family | mismatched |
| 観測内の未知string、欠損／不完全／競合／上限等 | unknown。未知string自体を新familyへ登録しない |

同familyの複数行は許容する。unique family配列は初出順を維持し、ソートして既存出力の順番を変えない。resolvedのraw_buildnameは最初の行をtrimした元のcaseを保持する。conflictはcanonical familyだけを返し、不明なnode名・address・証明書・不正なraw値を結果へ残さない。

## 5 意味検査の順序（互換性の中心）

構造・有限上限・policy整合の拒否と、以下の正常な値判定を分ける。先に該当した行で決定し、後の規則へ救済しない。

| 順序 | 条件 | evidence／判定 |
|---|---|---|
| 1 | policyがconfig_binding_mismatch | none／unknown、reason=config_binding_mismatch。ownerはこの前提なら観測GETを開始しない |
| 2 | invalid_observation | none／unknown、reason=observation_incomplete。valid設定でもfallbackしない |
| 3 | complete_200の行数=21 | none／unknown、reason=observation_limit。空欄・未知family・設定の有無より先 |
| 4 | 0行、または全行がnull／空string／trim後空欄 | 設定代替の値判定（§6） |
| 5 | 一部だけnull／空欄 | none／unknown、reason=observation_incomplete。全行空欄とは区別 |
| 6 | 非空値に未知familyが一つでもある | none／unknown、reason=observation_inconsistent。未知＋既知も同じ |
| 7 | canonicalな観測familyが2種以上 | conflict／unknown |
| 8 | 観測は1family、保持された設定assertionのfamilyと異なる | conflict／unknown。期限切れassertionでも競合を隠さない |
| 9 | 残る1family | measured resolved。Australiaならmatched、他既知familyならmismatched |

21行のall blankでも上限判定が先。20行のall blankなら設定代替へ進める。既知＋空欄＋未知では空欄の不完全が先、既知2family＋未知ではunknown familyのinconsistentが先である。

### 21行sentinelと22行以上・不正型を分ける

現行取得のmax=21を維持する。**有効な21行**はfamily判定前のobservation_limit、**22行以上のraw応答**は取得／envelope検査がinvalid_responseとして拒否するため、既存#observeReleaseに届く値結果はobservation_incompleteとなる。行projectionの不正型も、行数判定に達する前のinvalid_responseである。

比較器へ誤ってcomplete_200/22行を直接渡した場合は引数上限違反でinvalid_input。raw22行を適法なinvalid_observationへ正規化するのは取得ownerの該当境界だけであり、比較器自身が巨大なraw応答を読む設計ではない。この差を一律にobservation_limitへ揃える変更は別承認事項とする。

## 6 設定代替・期限切れ・競合

空／全空欄という**値の欠落**だけを本版の代替対象にする。policy.issueがあればそのreasonのnone／unknown。issueなし・assertionなしならobservation_unavailable。issueなし・有効assertionありなら、既存asserted値をcopyし、そのfamilyからmatched／mismatchedを判定する。

| 観測 | 設定 | 既存意味を保存する結果 |
|---|---|---|
| Australiaのみ | なし／有効Australia | measured resolved matched |
| Australiaのみ | 期限切れ／全予算不足だが同じAustralia | measured resolved matched＋対応するconfig issue limitation |
| Australiaのみ | 有効または期限切れのZurich | conflict unknown。期限切れだからassertionを捨ててmatchedにしない |
| Zurichのみ | なし／同じZurich | measured resolved mismatched。Australia設定で救済しない |
| 空／全空欄 | 有効Australia | operator_config asserted matched。ただし実測resolvedと呼ばない |
| 空／全空欄 | 有効Zurich | operator_config asserted mismatched |
| 空／全空欄 | 設定なし | none unknown / observation_unavailable |
| 空／全空欄 | expired／validity insufficient | none unknown / 対応するissue |
| 混在欠落・未知・不正・上限 | 有効Australia | 対応するunknown。代替しない |
| どの観測 | binding不一致 | 最優先のnone unknown。実測との競合判定へ進めない |

assertionを保持したままissueを持つpin済みpolicyを受けることが重要。期限切れ・予算不足は「代替には使えない」と「実測と相違する設定がある」を分ける。conflictのconfigured_familyは保持されたassertion.family、assertionなしならnull。観測familyは重複除去した初出順で最大5。

## 7 limitationsの語彙・順序

配列は既存順序を維持し、任意の文字列入力を連結しない。新warningの追加、sort、重複除去による順序変更をこの移行に混ぜない。

| 結果 | 固定limitations（記載順） |
|---|---|
| none unknown | `[reason, release_unknown]` |
| conflict unknown | `[release_evidence_conflict, release_unknown]` |
| measured matched | `[release_visible_nodes_only]`、policy issueがあれば続けてそのissue。ただしbinding mismatchは測定結果へ進まない |
| measured mismatched | 上記に続けて`release_mismatch` |
| asserted matched | `[release_operator_asserted, release_not_observed, release_config_may_be_stale, release_observation_unavailable]` |
| asserted mismatched | 上記4個に続けて`release_mismatch` |

reasonは本経路で使う固定7種：config_binding_mismatch、config_expired、config_validity_insufficient、observation_unavailable、observation_incomplete、observation_inconsistent、observation_limit。既存schemaにあるnot_configuredを新たに生成する契機はない。

conflictには現行どおりconfig_expired等を追加しない。empty 200のassertedでもwarning名はrelease_observation_unavailableのまま。これはfamily実測が得られないという既存意味であり、HTTPが失敗した証明ではない。参照元契約checkReleaseEvidenceの要件も併せて確認するが、検証成功だけからpolicyの真正性を認定しない。

## 8 呼出し境界・非200・実Permitとの分離

1. source／生成ownerが認証snapshot・元run時刻・接続先binding・設定を固定する。binding不一致なら従来どおり一覧／payload以前、release観測GETの前で止める。**取得後に比較器がunknownを返すだけではこの不変条件を守れない。**
2. 同sourceの固定取得／private ackによって値観測を得る。C/G/P・cleanup・同bytes解析・要求相関・停止理由は比較器へ移さない。private dataから比較器入力を組み立てる固定継続と、公開draftの採用禁止を維持する。
3. 比較器が返す値をpost-guard後に受理する。公開snapshot・JSON・模擬family・callerのmatched申告を入力ownerへ昇格させない。取消・期限・未知identity時は比較器の正常値があっても破棄する。
4. 実sourceで将来採用する場合でも#completeReleaseのpermit／release snapshot／port生成・bindは同class privateのまま残す。比較器にはそのblockを移さず、matchedを得ただけで自動登録しない。本書ではその接続を実施しない。

### 非200とエラー層は変更しない

旧legacy GETの#observeReleaseはaccess_denied／not_found_or_not_visible／upstream_unavailableを設定代替へ回す。これは既存の呼出し側の挙動であって、本版のpure inputにHTTP status・unavailable callbackを追加して有効化するものではない。初回比較器移行は200の値観測に限定し、legacy catchの挙動は変更せず別の移行課題として残す。

旧legacyのreadRowsが投げたinvalid_responseを#observeReleaseがobservation_incompleteにする境界と、固定200 bootstrapのUTF-8／JSON decode失敗がconsumer到達前にinvalid_responseで停止する境界も違う。同じcode名だからと全経路の例外をinvalid_observationへ正規化しない。受信上限・cancel・deadline・認証失敗・cleanup未確認は通常のunknownへ格下げせず、上位の固定失敗として保持する。

B-02-03の403／404・no_body・cancelled cleanupはstatus-onlyの非実行事実であり、空200ではない。このnative証拠をcomplete_200やinvalid_observationへ変換しない。ACKB-02のdispatch後非200遮断・SA-03の承認条件・実Permit発行を本比較器の実装へ混ぜない。

## 9 合成試験の受入条件案

期待値は旧関数の返値をコピーせず、固定decision tableから独立に書く。新旧同じpure関数を呼ぶだけの差分比較を唯一のoracleにしない。旧試験はすべて残し、現時点の対応表の分類・件数も実装前には変更しない。

| 試験群案 | 独立に検証する条件 | 対応する旧証拠／残る限界 |
|---|---|---|
| RC-FAMILY | 既知5family、trim／大小文字、未知string、接頭辞誤推測の拒否、同family重複 | ACK-08/09/14。pure成功は実source判断・permitの証明ではない |
| RC-ABSENT | 0行、null・空欄・空白だけ、20行空欄、有効／なし／失効設定 | ACK-10/11/15、operator-release-fallback。空200だけを対象とする |
| RC-PARTIAL | known＋null、known＋blank、unknown＋blank、unknown混在、invalid_observation | 既存release-gate／operator fallback。元の原因層の維持も別assertする |
| RC-LIMIT | 20行正常、21行正常／全空欄／未知、正規化済み22行引数拒否、raw22行はowner側の別検査 | ACK-13。21sentinelとraw response capを区別 |
| RC-CONFLICT | 観測複数familyの初出順、設定と相違、期限切れ／予算不足設定も相違、同familyならmeasuredを保持 | ACK-12/16。実source bindingは未代替 |
| RC-POLICY | binding不一致最優先、expires=start、start+deadline等号、+1ms、未来asserted、issue矛盾、assertion欠落 | 設定pinの既存境界を維持。純粋値では設定所有者を証明しない |
| RC-LIMITATIONS | 上表の全配列を順序込みexact比較、conflictへissueを追加しない、private reference不在 | ACK-14〜16とsource-release-binding。実portのimmutable snapshotは別責務 |
| RC-INPUT | unknown field、getter／proxy、過大配列／string、関数、status-only／偽permit、model不一致 | 固定invalid_input、無I/O／時計無観測、raw値非出力を確認 |
| RC-PURITY | 同固定入力の反復結果一致、入力非変更、結果fresh／deep freeze、wall clockを変えても結果不変 | 純粋module保証のみ。実classの時刻採取・同期失効は別試験 |

limitsのmaxやfamily集合が変わる場合はmodel_id／対応表を再レビューする。旧caseのACK-29/34〜36（偽permit・実private結合）は純粋比較器だけでは完了にしない。RC-POLICY等の新案は現在の330件一覧へ実在caseとして加えない。

## 10 実装順の提案と未確認事項

1. **RC-01（限定実装済み、§11）**：strict構造入力／非実行draftの内部型・family値の最小共有境界。owner・clock・I/Oなしで独立oracleを作る。意味比較は含めない。
2. **RC-02（純粋値として実装済み、§12）**：本書の順序・limitationsを同期比較器に実装。policy自己整合・構造拒否とordinary unknownを分ける。新規合成試験を追加し旧試験を残す。
3. **RC-03（差分設計のみ、実装・切替は別承認）**：[固定採用境界・接続差分draft-0.1](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)で、開発D先行と実source Rを分離した。200値の固定継続・生成元・pre/post guard・上位停止・既存Permit block不変を具体化する。legacy非200 catchは同時に移さない。
4. **B-03**：旧case対応表の更新、専用開発build／compiled連続試験と本番compiled回帰を別集計。実Permit結合の未代替保証を明記したままにする。

未確認事項：壁時計逆行を含む最終結果時刻との整合、legacy catchを後日移すときの固定failure分類、実classのprivate採用点でのguard位置、費目の正確なlayout／全体work。family定義の最小import閉包だけはRC-01で確認した（§11）。残る事項を本書だけで確認済みにせず、旧caseの分類は引き続きnot_evaluated／未対応のままで、正式発行口・全体受付は無効とする。

## 11 RC-01限定実装と残差

`src/servicenow/review-kernel/release-comparison.ts`に`parseReleaseComparisonInput`、readonly入力型、`ReleaseComparisonDraft`／結果型を追加した。parser成功は`{ok:true,input}`であり、comparison draftやmatched判定ではない。draftの権限4項目は型上もfalse固定で、Permit property・draft生成関数・公開draft採用口は追加しない。

構造検査は、固定model、strict key／tag、lowercase hash、canonical設定family、rows最大21／build_name最大40、owner日時最大40／有限epoch、deadline整数1〜60000／安全加算を扱う。complete_200だけobserved_atを要求し、not_requestedはassertionのbinding不一致と対応issueを必要とする。assertionなしのissueは拒否する。その他のpolicy期限・issue自己整合と§5〜7の意味比較はRC-02の責務であり、構造受理を意味検証済み・取得開始可能へ昇格させない。observed_at≧started_atの新制約は追加しない。

inputはown data descriptorだけから一度copyする。Node標準`node:util`の`types.isProxy`を反射操作より先に使用し、revokedを含むProxyのtrap、getterを実行しない。特殊prototype・symbol・非enumerable field・undefined・関数・Promise・buffer・循環／深すぎる構造・疎配列・余剰array keyを固定invalid_inputで拒否する。内部copyには深さ4、値node128、object key10、array要素21の構造枠を置く。受理値はfresh deep freezeし、エラー本文／入力値は返さない。

**設定asserted_at／expires_atの文字数上限は承認待ちのまま**。既存ISO検査を維持し、長い小数秒を切詰め・正規化しない。長い設定日時の既存schema／新parser双方の受理を合成確認する。したがって入力全体のbyte／workの有限上界は未確定。ownKeys等の列挙前allocationも含め、これをbounded transportや全体受付の証明とは扱わない。

`release-family.ts`はimportなしのcanonical5値・whole-string正規化／matchだけを持つ。catalog公開関数はwrapperのまま意味を維持し、設定schema・結果schemaも同じtupleを参照する。比較入力kernelのruntime importはzod・node:util・familyだけ。draftが参照する既存ReleaseEvidenceはtype-onlyで、生成JSから消える。sourceのrelease判断・非200 catch・実Permit block・公開decisionの可変性は変更しない。

[RC-01検証記録](E2E_BEST_PRACTICE_RELEASE_CONTRACT_RC01_2026-11-01.md)にRED/GREEN、合成入力、型の負の試験、既存回帰、compiled／梱包確認を記録する。旧case対応表の分類・件数は変更せず、B-03 compiled保証やrelease判断移行の完了とは数えない。RC-01時点の意味比較未実装という残差は、次節のRC-02で純粋値についてのみ対応した。

## 12 RC-02純粋比較と非実行draft生成

同moduleの`compareRelease(unknown)`はRC-01の構造copy／freezeを必ず経由し、§2のpolicy日時・issue自己整合を確認した後に§5〜7の固定順で判定する。`parseReleaseComparisonInput`は互換性のため構造検査のままとし、policy意味検証済みの証拠へ昇格させない。

asserted_atの未来・expires_at≦asserted_atを拒否し、binding不一致→expires≦start→expires≦start＋deadline→issueなしの順でpin済みissueとexact照合する。issueの欠落・付替えで期限を救済しない。observed_atや現在時刻はpolicy期限を動かさず、observed_at≧started_atという新制約も追加しない。設定日時文字数の上限は引き続き承認待ちで、長い小数秒を元の表現のまま返す。全入力byte／work上界のUnknownは解消しない。

構造／policy不整合はfrozenな`{ok:false,code:invalid_input}`、ordinary unknown・mismatchedはok=trueの非実行draftとする。binding不一致の優先、invalid観測、21行sentinel、全空欄の値代替、一部欠落、未知family、複数観測／設定競合、実測の順を維持する。設定がexpired／insufficientでもfamily相違の競合から捨てず、競合limitationsにはそのissueを追加しない。unique familyは初出順、実測raw_buildnameは最初のtrim済みcaseを保つ。

正常draftは毎回freshな入力copyから生成し、decision・evidence・配列・permissionsまでdeep freezeする。権限4項目は常にfalse、Permit／owner／consumer／採用tokenは持たない。draftのJSON／copyを比較入力として渡しても拒否される。拒否出力に権限fieldはなく、authorityを返さないという既存の固定拒否契約を維持する。

[RC-02検証記録](E2E_BEST_PRACTICE_RELEASE_COMPARISON_RC02_2026-11-01.md)では、旧関数の返値をoracleにせず、固定表からevidence全体とlimitations順序を独立に期待する70件を追加。既知familyの5×5組合せ・期限の等号／+1ms・優先関係・秘密非出力・fresh freezeを含む。compiled fixtureと梱包の純粋import／時計・timer・fetch不在検査も拡張する。

既存BoundedUpdateSetSource／設定pin／認証・会計・private Permit blockは変更しない。旧試験と対応表の分類は維持し、純粋値の成功を実class bindingや別assembly移行の完了には数えない。次はRC-03の採用差分設計・生成元とpre/post guard・上位停止保持の受入条件であり、本変更では接続・fallback有効化を行わない。

## 13 RC-03の接続差分設計

[RC-03詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)を追加した。開発sourceには現状UTC／policy条件がなくrelease値も破棄されるため、test-onlyの同context bindingから先行する。実sourceでは既存`#completeRelease`への非matched draft再投入によるwarning二重追加を避け、公開可変copyとprivate snapshotを分離する。Rの時刻採取位置・失敗owner／解放と同期処理の上界は承認／確認待ちで、本番差替えは行わない。新設計は実装済み・旧case移行済みを意味せず、正式発行口閉鎖・全体受付無効・調査保留を維持する。
