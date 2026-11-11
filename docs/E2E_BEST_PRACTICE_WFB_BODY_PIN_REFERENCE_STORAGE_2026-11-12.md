# WF-B：同issued/current格納・private実参照照合と初回rejected保持の合成検証

Date: 2026-11-12 / 基準HEAD: `ad00f28` / 未コミット作業内容の検証。

対象は[接続差分設計§14](BEST_PRACTICE_WFB_BODY_PIN_REFERENCE_STORAGE_DESIGN.md)と[格納親§16](BEST_PRACTICE_WFB_BODY_PIN_STORAGE_RETURN_STOP_DESIGN.md)・[private pin親§20](BEST_PRACTICE_WFB_BODY_PRIVATE_PIN_CONNECTION_DESIGN.md)。開始時のworktreeはクリーン。旧call／準備の期待値・期限を維持し、正式発行口・既存C実行入口・body起動閉鎖、全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。

## 実装範囲・所有と固定拒否

package除外compositionへcreateProbeBodyPinReferenceStorageFake／wfb-body-pin-reference-storage-1を追加した。APIは凍結prepare／check／checkLegacy／close／inspectと有限scriptだけ。元constructor／prepare／frameの同root／source／startをprivateに供給し、旧格納前準備のbefore_issued検査後だけから分岐する。公開snapshot・同値copy・任意object／callbackから資格を生成しない。runtime／旧facade exportや実sessionの台帳は変更しない。

G_Iは実I=S→step issued→stage issued→境界after、G_Cは実C=I→step current→stage captured→境界afterの直接記録群。実private参照と狭いphase値を対に照合し、旧初期9参照全空checkerを格納後へ流用しない。元rootがsourceの所有を保持し、I/C/Jは同startの借用責務である。source claimはunused、payload6参照・BC data／grant／duty・ready／bodyは未開始のまま。

captured後は実Cの欠落・I不一致・phase／原値不正・既存Jを不一致候補から区別する。正規trialで既に捕捉した不一致Cだけを、step current／境界beforeの最終資格検査後に初回Jへ保持する。G_JはJ=C・hold retained_unconfirmed・境界after・receiver初回binding_mismatchと失敗位置を一群で記録する。保持postにはframe内局所qと実C/Jの同一性を確認し、hold confirmedだけへ進める。これはpin confirmedやcleanup確認ではない。

通常中間到達はcaptured／step current・実I=C=S・J空であり、固定返答pin_confirmation_not_connected／root construction_unconfirmed、source／receiver receiver_unconfirmedで止まる。capturedとblockedのpostを通した後だけ先行referencePostCheckedをtrueにし、単に実I/Cが存在する途中throwと区別する。rejected保持後のthrow／closeでもJや最初のbinding_mismatchをclearしない。caller BP03 call before／after、source call、receiver実step／現在境界／初回位置を別軸で保持する。finallyは元の両busyだけを解除する。

## RED／GREENと初回失敗の扱い

1. 通常中間停止の新1件はfactory未実装TypeErrorでRED。新mode・private実参照照合・G_I/G_Cを追加し、旧call43件／準備35件とともに成功した。
2. 最初の通常試験は旧receiverPinに公開されていないissuedSame／currentSameを要求して失敗した。実装はこれらの実値を内部viewだけへ供給していた。旧公開projectionを拡張せず、公開試験は保持prefixへ修正し、実参照の照合は別compiledの実slot／偽装view対照で確認した。private照合を省略して試験を通したものではない。
3. copy_current、close_before_current、missing_currentの各tracerはscript未受付input_rejectedでRED。それぞれ有限scriptと当該保持／停止処理を追加した後に成功した。
4. 開始前closeの試験はfirst closedを要求して失敗し、prepare後にも同じ不正な期待を残して再失敗した。既存rootは開始前closeではclosed dispositionを返すが、未開始時のfirstはnoneのままであることをソースと旧試験から確認した。開始前closeはdisposition・生成／trial不在で確認するよう修正し、製品closeや旧factoryの仕様を変えていない。
5. 追加した捕捉直後throwの回帰は、実I/Cが存在するだけでpin_confirmation_not_connectedへ誤分類されてRED。literal falseの先行referencePostCheckedを追加し、最終中間post後だけtrue、callerは原値trueも必須とした。途中throwはconstruction_unconfirmed、正常中間は固定未接続返答へ分離してGREEN。初期true／秘密文字列の拒否と、この分類節を外した場合の誤分類もcompiledで確認した。

途中版の成功を追加対照後の結果へ読み替えず、期限・設定・旧経路の期待値を緩めていない。

## 合成試験とcompiled保証

新Vitest50件は公開APIを使う。5通常観測点×fault／close／prior／再入の20件と、2保持観測点×同4種の8件は実装表をimportせず、固定原始eventの順序・独立条件式から保持prefix／stage／step／現在境界・初回理由を予測する。混入／Proxy、先行失敗、入力hook 0、開始前close、余分な引数、cache同一性・有限凍結plain graph・秘密非出力も確認する。

| 対象 | 確認した保証 |
|---|---|
| 同実参照 | compiled返却直前に実I/Cが元S、J不在であることを確認。原始値checkerの正例と区別 |
| 実slot故障5件 | I不一致・C欠落・J既存・stage不正・hold状態不正を拒否し、元prefixと未確認責務を保持 |
| 実slot／値view偽装3対照 | issued／before_current／capturedの実fieldを壊し、値viewだけ正しく偽装しても拒否。実参照checkerだけの迂回では最初の拒否点が予定suffixへ変化 |
| 固定3同期群 | ASTでG_I／G_C／G_Jの直接代入・固定順を比較。群中の呼出し／allocation／hook／awaitは許さない |
| 先行5scalar | start hold／中間post完了とroot点／初回点／再入結果がconstructor前のliteral。root空返答参照も先行配置 |
| 初回診断 | G_J後faultでbinding_mismatchを維持。failBodyPinStorageReceiverのfirst none guardを外すとreceiver_unconfirmedへ失われる対照 |
| 保持post | 保持後の実C差替えでretained_unconfirmed。実C===q節を外すとhold confirmedへ誤進行する対照 |
| 中間分類 | captured直後throwは通常未接続返答にしない。完了scalar条件除去で誤分類する対照、初期true／不正文字列の2拒否 |
| 失効／finally | 保持前closeでJなし、保持後closeでJ保持／未確認。receiver又はcaller finallyを外すと各busy残留を検出 |
| 非昇格 | callee accepted偽装でもcaller state_invalid。source claim／payload／BC／ready／bodyへの禁止書込み0 |
| 投影 | root点／初回点／再入結果・holdの4allowlist対照、public strict boolean・秘密非echo |
| semantic compile-fail | private checker／point／store／retain／captured-baseへの外部利用、不正phase／hold／点、公開snapshotからのsource参照復元の9行を拒否 |

正常I/C writerはstoreBodyPinReferences、J writerはretainBodyPinRejectedだけ。合成current copy／欠落はbodyPinReferenceFaultに限定し、AST上の参照代入は計5箇所である。旧compiledの5本はclass／method／field単位の限定許可を追加し、source claim／payload6参照／後続stageの一括解禁はしない。旧入口で参照空のruntime対照も維持した。開発moduleのexport期待値2箇所だけへ新factory名を追加した。

以前は等価だった初回診断guardは新G_J→throw→catchにより非等価となった。残る4つの重複identity／mode節は新参照writerだけで一律非等価とはせず、元固定tuple・constructor固定mode・唯一callerの条件が続く範囲に限定する。新全節の感度・全費用・実layout／OOM耐性は未証明である。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新reference＋旧storage／call＋composition | 4ファイル134件成功、失敗0（新50件） |
| 関連合成回帰 | 38ファイル2,894件成功、失敗0 |
| 新compiled（追加対照後） | exit 0。実slot5・偽装view3・固定群3・先行scalar5・型拒否9行等 |
| 変更した旧compiled5本 | storage／contracts／start／call／bridgeが各exit 0 |
| 新旧compiled28本の最終連続実行 | 全28本exit 0、失敗／timeout 0。1process当たり60,000msの外側枠を維持 |
| strict TypeScript | compositionとbody全試験の明示対象でexit 0 |
| build | exit 0 |
| 変更コード・試験10ファイルのlint | exit 0、error／warning 0 |
| offline・ignore-scripts梱包dry-run | exit 0、441ファイル、src／tests／新fixture混入0。archive生成／公開なし |

関連回帰はprobe全試験、composition／snapshot-read-start／snapshot-value、read-hash全4、source-map全2、pending2、canonical-supply全3／canonical-gate、journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-startを明示して実行した。全repositoryのVitest回帰は未実施である。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck`へcomposition・body全試験・composition試験を指定した。buildは`bdo npm run build`。

compiledは`bdo node tests/review/fixtures/compiled-*.mjs`のうち対象28本を列挙し、1process当たり既存同様60,000msの外側枠で順次実行した。対象は新reference、旧storage／call／bridge／start／contracts／source-issuer／storage-data-split／bind-fields／bundle／live／seed／local-exit／exit-guard／exit-preparation／grant-capture／run-preparation／frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actual。全28本exit 0、失敗／timeout 0で、旧body-liveも42,287msで成功した。前工程のtimeout原因やscratch回収の未確認を今回成功で解消扱いにはしない。

packはbuild後、一時cacheで`bdo proxy npm pack --dry-run --json --ignore-scripts --offline`の一覧だけを確認し、finallyでcacheを除去した。依存取得／導入・archive展開・実worker／runtime接続を伴う梱包試験は実行していない。

## 費目・未接続と差分範囲

追加保持はstartのhold stateと中間post完了2scalar、rootの3scalar・空reply参照と固定mode。実参照／phaseの検査・有限走査・診断／投影・合成copy構築を別費目として扱い、元owner／source／BS13carrier／receiver9参照／call・trial予約は再発行／二重計上しない。実E／S・unit係数・layout／allocation／GC／OOM・全guard数／全体work上界・停止後解消予約・診断必着はUnknown。

pin checked／confirmed・accepted／PC08・C-03／BP04・source claim消費・payload借用／bind・構築ready・body起動・Journal供給・field clear／root終端・正式発行は未接続。hold confirmedや中間post完了をこれらの証拠へ読み替えない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行っていない。

差分は合成fixture、新Vitest／compiled、旧compiled5本の限定AST更新、開発export期待値2箇所、CHANGELOG・設計3文書・本記録。src・manifest／lockfile・設定・旧facadeは変更しない。index登録・コミットは行わず、この検証は未コミット作業内容に対するもので、コミット対象だけの隔離検証ではない。

最終確認：文書4ファイルのローカルリンク38件・表22件に欠落／列ずれなし。設計14／16／20節、RW01〜06／RE01〜12の順序・重複／欠落、末尾改行・行末空白を確認した。最新の関連回帰も38ファイル2,894件成功、strict TypeScriptも再実行してexit 0。作業差分は上記15ファイルだけ、indexは空、HEADは`ad00f28`のままである。

## コミット対象だけの隔離再検証（2026-11-12）

上記は実装時の記録。本節はその後のコミット依頼に対する再検証で、基準HEADは`ad00f28`。今回の15ファイルだけを明示してindexへ登録し、全indexを一時フォルダへ展開した。全1,528ファイルのGit blob hash・実行属性がindexと一致し、未登録の作業中変更を含めていないことを確認した。既存node_modulesへの参照だけを再利用し、依存取得・導入・設定変更はしていない。

分離した内容だけでbuild・strict TypeScriptがexit 0、関連38ファイル2,894件が成功・失敗0、変更コード／試験10ファイルのlintはerror／warning 0だった。新旧compiled28本は各60,000msの外側枠を維持して順次実行し、全28本exit 0、失敗／timeout 0。旧body-liveも35,954msで成功した。全repositoryのVitest回帰は今回も未実施であり、過去のtimeout原因・打切り時scratch回収の未確認を解消扱いにはしない。

build後のoffline・ignore-scripts梱包dry-runは441ファイル、src／tests／新fixture混入0、archive生成・公開なし。一時cacheはfinallyで除去した。文書4ファイルのローカルリンク38件・表22件、設計14／16／20節、RW01〜06／RE01〜12の順序・改行／空白も確認した。

検証後は実装・試験を変更せず、本節だけを追加・再登録する。記録以外のindex全1,527項目のfingerprint不変、最終対象15ファイル、分離した全1,528ファイルの内容・属性一致を再照合する。pin checked／confirmed・PC08・C-03・body起動・正式発行は未接続、全体受付無効・Unknown・調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行わない。
